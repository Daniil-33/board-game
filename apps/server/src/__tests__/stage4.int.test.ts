import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { checkInvariants, pendingDeadlines, projectState } from '@game/game-core';
import { PROTOCOL_VERSION } from '@game/protocol';
import { sql } from 'kysely';
import { useHarness } from './helpers/harness.js';
import { connect, http, login, startServer, stopServers, TestSocket } from './helpers/server.js';
import { logEntries } from './helpers/db.js';
import { cid } from './helpers/game.js';
import { createServer } from '../server.js';
import * as builders from '../test-fixtures.js';
import { buildFixture } from '../test-fixtures.js';

const h = useHarness({ perTest: true });
beforeEach(() => { vi.stubEnv('NODE_ENV', 'test'); vi.stubEnv('E2E_FIXTURES', '1'); });
afterEach(async () => { await stopServers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });

async function fixture(name = 'open-rent') {
  const server = await startServer(h);
  const guests = await Promise.all(['a', 'b', 'c'].map(n => login(server, n)));
  const response = await http(server, 'POST', '/api/test/fixtures', { body: { fixture: name, tokens: guests.map(g => g.token) } });
  expect(response.status).toBe(201);
  const id = response.body.roomId as string;
  const clients = await Promise.all(guests.map(g => connect(server, g, id)));
  const room = server.manager.get(id)!;
  expect(room.state).toEqual(buildFixture(name as never, guests.map(g => g.guestId), server.clock.now()));
  expect(await logEntries(h.db, id)).toEqual([]);
  const stored = await server.store.loadGame(id);
  expect(stored.snapshot).toEqual(room.state);
  expect(stored.snapshot!.revision).toBe(room.state.revision);
  const owner = guests.findIndex(g => g.guestId === room.state.turn!.playerId);
  async function command(type: string, payload: unknown = null, error?: string) {
    const socket = clients[owner]!.socket;
    const frame = { t: 'Command', commandId: cid(type), type, payload,
      expected: { kind: 'target', target: { kind: 'turn', id: room.state.turn!.turnId } } };
    const before = room.state;
    const logs = await logEntries(h.db, id);
    socket.send(frame);
    if (!error) {
      for (const [i, client] of clients.entries()) {
        const update = await client.socket.nextOf('Update');
        expect(update.view).toEqual(projectState(room.state, { kind: 'player', id: guests[i]!.guestId as never }));
        expect(update.events).toEqual((await logEntries(h.db, id)).at(-1)!.events);
      }
    }
    const ack = await socket.nextOf('Ack');
    expect(ack.outcome).toBe(error ? 'rejected' : 'accepted');
    if (error) {
      expect(ack).toMatchObject({ error: { code: error } });
      expect(room.state).toBe(before);
      expect(await logEntries(h.db, id)).toEqual(logs);
    }
    return { frame, ack, socket };
  }
  return { server, guests, clients, room, id, command };
}

it('three guests see payment, specific errors and deduplicated stale intents', async () => {
  const g = await fixture();
  const before = g.room.state;
  const rent = before.rent!;
  const paid = await g.command('PayRent');
  expect(g.room.state.rent).toBeNull();
  expect(g.room.state.balances[rent.payerId]).toBe(before.balances[rent.payerId]! - rent.amount);
  expect(g.room.state.balances[rent.ownerId]).toBe(before.balances[rent.ownerId]! + rent.amount);
  expect((await logEntries(h.db, g.id))[0]!.events.some(e => e.type === 'RentPaid')).toBe(true);
  const counts = g.clients.map(c => c.socket.frames.length);
  paid.socket.send(paid.frame);
  expect(await paid.socket.nextOf('Ack')).toEqual(paid.ack);
  paid.socket.send({ ...paid.frame, commandId: cid('stale'), expected: { kind: 'target', target: { kind: 'turn', id: 'old' } } });
  expect(await paid.socket.nextOf('Ack')).toMatchObject({ outcome: 'rejected', error: { code: 'TARGET_MISMATCH' } });
  await g.command('PayRent', null, 'NO_RENT');
  expect(await logEntries(h.db, g.id)).toHaveLength(1);
  for (const [i, client] of g.clients.entries()) expect(client.socket.frames.slice(counts[i]).some(f => f.t === 'Update')).toBe(false);
});

it('builds, returns exact illegal-build code, and sells through sockets', async () => {
  const g = await fixture('building');
  const assets = Object.keys(g.room.state.owners);
  const build = await g.command('BuildHouse', { assetId: assets[0] });
  expect(g.room.state.houses[assets[0]!]).toBe(1);
  expect(g.room.state.turn!.quotas.builds).toBe(0);
  await g.command('BuildHouse', { assetId: assets[1] }, 'BUILD_QUOTA_USED');
  build.socket.send(build.frame);
  expect(await build.socket.nextOf('Ack')).toEqual(build.ack);
  expect(await logEntries(h.db, g.id)).toHaveLength(1);
  await g.command('SellHouse', { assetId: assets[0] });
  expect(g.room.state.houses).toEqual({});
  expect((await logEntries(h.db, g.id)).map(e => e.command.type)).toEqual(['BuildHouse', 'SellHouse']);
});

it('rejects protocol 3 before auth and returns ROOM_CLOSED without loading migrated rooms', async () => {
  const g = await fixture();
  const old = await TestSocket.open(g.server.wsUrl);
  old.send({ t: 'Hello', protocolVersion: 3, token: 'invalid', gameId: g.id, lastRevision: null });
  expect(await old.nextOf('Error')).toMatchObject({ code: 'PROTOCOL_VERSION_UNSUPPORTED' });
  await old.whenClosed();
  const before = await g.server.store.loadGame(g.id);
  // Execute the actual retirement migration body against an active room.
  await sql`update rooms set status = 'closed' where status in ('lobby', 'playing')`.execute(h.db);
  const socket = await TestSocket.open(g.server.wsUrl);
  socket.send({ t: 'Hello', protocolVersion: PROTOCOL_VERSION, token: g.guests[0]!.token, gameId: g.id, lastRevision: null });
  expect(await socket.nextOf('Error')).toMatchObject({ code: 'ROOM_CLOSED' });
  await socket.whenClosed();
  expect(await g.server.store.loadGame(g.id)).toEqual(before);
});

it('loader rejects invalid requests and unknown identities without partial rooms', async () => {
  const g = await fixture();
  const before = await h.db.selectFrom('rooms').selectAll().execute();
  const tokens = g.guests.map(g => g.token);
  for (const body of [
    { fixture: 'unknown', tokens }, { fixture: 'open-rent', tokens: [tokens[0], tokens[0]] },
    { fixture: 'open-rent', tokens, state: {} }, { fixture: 'open-rent', tokens: [] },
  ]) expect((await http(g.server, 'POST', '/api/test/fixtures', { body })).status).toBe(400);
  expect((await http(g.server, 'POST', '/api/test/fixtures', { body: { fixture: 'open-rent', tokens: [tokens[0], 'invalid'] } })).status).toBe(401);
  expect(await h.db.selectFrom('rooms').selectAll().execute()).toEqual(before);
});

it.each([undefined, 'production', 'staging', 'development'])('construction rejects unsafe opt-in with NODE_ENV=%s', async nodeEnv => {
  const ctx = h.manager();
  vi.stubEnv('NODE_ENV', nodeEnv);
  await expect(createServer({ db: h.db, manager: ctx.manager })).rejects.toThrow('E2E_FIXTURES');
});
it('route is absent without opt-in, including test mode', async () => {
  for (const env of ['test', 'production', 'staging']) {
    vi.stubEnv('NODE_ENV', env);
    vi.stubEnv('E2E_FIXTURES', undefined);
    const server = await startServer(h);
    expect((await http(server, 'POST', '/api/test/fixtures', { body: {} })).status).toBe(404);
  }
});

it('invalid builder output fails invariants before any inserts', async () => {
  const g = await fixture();
  const before = await h.db.selectFrom('rooms').selectAll().execute();
  vi.spyOn(builders, 'buildFixture').mockReturnValue({ ...g.room.state, houses: { unknown: 5 } });
  expect((await http(g.server, 'POST', '/api/test/fixtures', { body: {
    fixture: 'open-rent', tokens: g.guests.map(g => g.token),
  } })).status).toBe(500);
  expect(await h.db.selectFrom('rooms').selectAll().execute()).toEqual(before);
});

it('snapshot write failure rolls back room and membership atomically', async () => {
  const g = await fixture();
  const before = {
    rooms: await h.db.selectFrom('rooms').selectAll().execute(),
    members: await h.db.selectFrom('room_members').selectAll().execute(),
  };
  await sql.raw("CREATE FUNCTION reject_fixture_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected snapshot failure'; END $$").execute(h.db);
  await sql.raw("CREATE TRIGGER fixture_failure BEFORE INSERT ON game_snapshots FOR EACH ROW EXECUTE FUNCTION reject_fixture_snapshot()").execute(h.db);
  expect((await http(g.server, 'POST', '/api/test/fixtures', { body: {
    fixture: 'open-rent', tokens: g.guests.map(g => g.token),
  } })).status).toBe(500);
  expect(await h.db.selectFrom('rooms').selectAll().execute()).toEqual(before.rooms);
  expect(await h.db.selectFrom('room_members').selectAll().execute()).toEqual(before.members);
});

// RVW-002: exercise the real loader genesis through boot recovery and all reconnects.
it('restarts an HTTP fixture-created open settlement with exact state and guest projections', async () => {
  const g = await fixture('open-rent');
  const before = g.room.state;
  expect(before.rent).not.toBeNull();
  const persisted = await g.server.store.loadGame(g.id);
  await g.server.stop();
  const restarted = await startServer(h, { restore: true, now: g.server.clock.now() });
  expect(restarted.manager.get(g.id)!.state).toEqual(before);
  expect(restarted.clock.pending).toEqual(pendingDeadlines(before).map(d => d.at));
  expect(await restarted.store.loadGame(g.id)).toEqual(persisted);
  for (const guest of g.guests) {
    const client = await connect(restarted, guest, g.id, before.revision);
    expect(client.welcome.revision).toBe(before.revision);
    expect(client.welcome.view).toEqual(projectState(before, { kind: 'player', id: guest.guestId as never }));
  }
});

// Browser fixture contract: a real RollDice must perform the landing, with no
// forged settlement or synthetic energy sum. Try independent real transitions.
it.each(['pre-roll-regular-rent', 'pre-roll-full-group-rent', 'pre-roll-logistics-rent', 'pre-roll-energy-rent', 'pre-roll-shortfall', 'pre-roll-own-asset', 'bonus-building'])(
  '%s starts pre-roll and reaches its target with real socket dice', async name => {
    let hit = false;
    for (let attempt = 0; attempt < 100 && !hit; attempt++) {
      const g = await fixture(name);
      const before = g.room.state;
      expect(before.turn!.rolled).toBe(false);
      expect(before.rent).toBeNull();
      await g.command('RollDice');
      const entry = (await logEntries(h.db, g.id)).at(-1)!;
      const roll = entry.events.find(e => e.type === 'DiceRolled')!;
      const dice = (roll.payload as { dice: number[] }).dice;
      expect(dice).toHaveLength(2);
      const sum = dice.reduce((a, b) => a + b, 0);
      expect(g.room.state.positions[before.turn!.playerId]).toBe((before.positions[before.turn!.playerId]! + sum) % 40);
      if (name === 'pre-roll-own-asset' || name === 'bonus-building') {
        hit = !!g.room.state.board!.cells[g.room.state.positions[before.turn!.playerId]!]!.asset;
        expect(g.room.state.rent).toBeNull();
        expect(g.room.state.purchase).toBeNull();
      } else {
        hit = g.room.state.rent !== null;
        if (hit && name === 'pre-roll-energy-rent') expect(g.room.state.rent!.diceSum).toBe(sum);
        if (hit && name === 'pre-roll-logistics-rent') expect(Object.keys(before.owners)).toHaveLength(2);
        if (hit && name === 'pre-roll-shortfall') {
          // A start crossing can award money; browser evidence accepts only a shortfall landing.
          hit = g.room.state.balances[before.turn!.playerId]! < g.room.state.rent!.amount;
          if (hit) await g.command('PayRent');
        }
      }
      await g.server.stop();
    }
    expect(hit, `${name}: no target landing in 100 real rolls`).toBe(true);
  }, 60_000,
);
