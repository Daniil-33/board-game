import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CURRENT_RULES_VERSION, projectState, type GameEndedEvent, type GameState, type PlayerId } from '@game/game-core';
import { PROTOCOL_VERSION } from '@game/protocol';
import { sql } from 'kysely';
import { useHarness } from './helpers/harness.js';
import { connect, http, login, startServer, stopServers, TestSocket } from './helpers/server.js';
import { logEntries } from './helpers/db.js';
import { cid } from './helpers/game.js';
import { buildFixture, type FixtureName } from '../test-fixtures.js';

const h = useHarness({ perTest: true });
beforeEach(() => { vi.stubEnv('NODE_ENV', 'test'); vi.stubEnv('E2E_FIXTURES', '1'); });
afterEach(async () => { await stopServers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });

const rows = async (id: string) => ({
  rooms: await h.db.selectFrom('rooms').selectAll().where('id', '=', id).execute(),
  logs: await h.db.selectFrom('game_log').selectAll().where('game_id', '=', id).orderBy('revision').execute(),
  snapshots: await h.db.selectFrom('game_snapshots').selectAll().where('game_id', '=', id).orderBy('revision').execute(),
  results: await h.db.selectFrom('game_results').selectAll().where('room_id', '=', id).execute(),
});

async function fixture(name: FixtureName) {
  const server = await startServer(h);
  const guests = await Promise.all(['a', 'b', 'c'].map(n => login(server, n)));
  const response = await http(server, 'POST', '/api/test/fixtures', { body: { fixture: name, tokens: guests.map(g => g.token) } });
  expect(response.status).toBe(201);
  const id = response.body.roomId as string;
  const clients = await Promise.all(guests.map(g => connect(server, g, id)));
  const room = server.manager.get(id)!;
  expect(room.state).toEqual(buildFixture(name, guests.map(g => g.guestId), server.clock.now()));
  const seat = (playerId: string) => guests.findIndex(g => g.guestId === playerId);
  /** Every guest, eliminated or not, receives the committed events and its own projection. */
  async function expectUpdate() {
    const updates = [];
    for (const client of clients) updates.push(await client.socket.nextOf('Update'));
    const entry = (await logEntries(h.db, id)).at(-1)!;
    for (const [i, update] of updates.entries()) {
      expect(update.revision).toBe(room.state.revision);
      expect(update.view).toEqual(projectState(room.state, { kind: 'player', id: guests[i]!.guestId as PlayerId }));
      expect(update.events).toEqual(entry.events);
    }
    return entry.events;
  }
  async function command(type: string, payload: unknown = null, options: { error?: string; by?: string } = {}) {
    const by = options.by ?? room.state.turn!.playerId;
    const socket = clients[seat(by)]!.socket;
    const frame = { t: 'Command', commandId: cid(type), type, payload,
      expected: type === 'Resign' ? { kind: 'revision', revision: room.state.revision }
        : { kind: 'target', target: { kind: 'turn', id: room.state.turn!.turnId } } };
    const before = await rows(id);
    const counts = clients.map(c => c.socket.frames.length);
    socket.send(frame);
    if (options.error) {
      const ack = await socket.nextOf('Ack');
      expect(ack).toMatchObject({ outcome: 'rejected', error: { code: options.error } });
      expect(await rows(id)).toEqual(before);
      for (const [i, client] of clients.entries()) {
        expect(client.socket.frames.slice(counts[i]).some(f => f.t === 'Update')).toBe(false);
      }
      return { frame, ack, socket, events: [] as const };
    }
    // Updates precede the sender's Ack.
    const events = await expectUpdate();
    const ack = await socket.nextOf('Ack');
    expect(ack).toMatchObject({ outcome: 'accepted', revision: room.state.revision });
    return { frame, ack, socket, events };
  }
  return { server, guests, clients, room, id, command, seat };
}

const payload = <T>(events: readonly { type: string; payload: unknown }[], type: string) =>
  events.find(e => e.type === type)?.payload as T;
const mortgagedAsset = (state: GameState) => Object.keys(state.mortgages)[0]!;

it('mortgages and redeems over sockets with exact rejection codes on every guest', async () => {
  const g = await fixture('mortgage-expiry');
  const assetId = mortgagedAsset(g.room.state);
  const payer = g.room.state.turn!.playerId;
  const term = g.room.state.mortgages[assetId]!;
  const cash = g.room.state.balances[payer]!;
  await g.command('Mortgage', { assetId }, { error: 'ALREADY_MORTGAGED' });
  const creditorAsset = g.room.state.board!.cells.find(c => c.asset && c.asset.assetId !== assetId)!.asset!.assetId;
  await g.command('Redeem', { assetId: creditorAsset }, { error: 'NOT_OWNER' });
  await g.command('Mortgage', { assetId }, { error: 'NOT_ACTIVE_PLAYER', by: g.room.state.order!.find(p => p !== payer)! });

  const redeemed = await g.command('Redeem', { assetId });
  expect(payload(redeemed.events, 'AssetRedeemed')).toEqual({ playerId: payer, assetId, amount: term.advance });
  expect(g.room.state.mortgages).toEqual({});
  expect(g.room.state.balances[payer]).toBe(cash - term.advance);

  const mortgaged = await g.command('Mortgage', { assetId });
  expect(payload(mortgaged.events, 'AssetMortgaged')).toEqual({ playerId: payer, assetId, advance: term.advance, auto: false });
  expect(g.room.state.mortgages[assetId]).toEqual({ advance: term.advance, lapsCompleted: 0, pending: g.room.state.order, lockedTurnId: g.room.state.turn!.turnId });
  expect(g.room.state.balances[payer]).toBe(cash);
  for (const client of g.clients) expect(client.socket.frames.filter(f => f.t === 'Update').at(-1)).toMatchObject({
    view: { mortgages: { [assetId]: { advance: term.advance, lapsCompleted: 0, remainingLaps: 8 } } } });

  // A duplicate delivery answers with the original Ack and broadcasts nothing.
  const counts = g.clients.map(c => c.socket.frames.length);
  mortgaged.socket.send(mortgaged.frame);
  expect(await mortgaged.socket.nextOf('Ack')).toEqual(mortgaged.ack);
  expect(await logEntries(h.db, g.id)).toHaveLength(2);
  for (const [i, client] of g.clients.entries()) expect(client.socket.frames.slice(counts[i]).some(f => f.t === 'Update')).toBe(false);
});

it('rejects a malformed mortgage payload and a protocol 4 Hello', async () => {
  const g = await fixture('mortgage-expiry');
  const socket = g.clients[g.seat(g.room.state.turn!.playerId)]!.socket;
  socket.send({ t: 'Command', commandId: cid('bad'), type: 'Mortgage', payload: { assetId: '' },
    expected: { kind: 'target', target: { kind: 'turn', id: g.room.state.turn!.turnId } } });
  expect(await socket.nextOf('Error')).toMatchObject({ code: 'MALFORMED_FRAME' });
  const old = await TestSocket.open(g.server.wsUrl);
  old.send({ t: 'Hello', protocolVersion: 4, token: g.guests[0]!.token, gameId: g.id, lastRevision: null });
  expect(await old.nextOf('Error')).toMatchObject({ code: 'PROTOCOL_VERSION_UNSUPPORTED', message: `The server speaks protocol version ${PROTOCOL_VERSION}` });
  await old.whenClosed();
});

it('expires a mortgage at the turn boundary and frees the asset on every guest', async () => {
  const g = await fixture('mortgage-expiry');
  const assetId = mortgagedAsset(g.room.state);
  const payer = g.room.state.turn!.playerId;
  const { advance } = g.room.state.mortgages[assetId]!;
  const { events } = await g.command('EndTurn');
  expect(payload(events, 'MortgageExpired')).toEqual({ playerId: payer, assetId, advance });
  expect(g.room.state.mortgages).toEqual({});
  expect(g.room.state.owners[assetId]).toBeUndefined();
});

it.each([1, 2, 3] as const)('liquidation tier %i: events and balances reach every guest', async tier => {
  const g = await fixture(`liquidation-tier-${tier}`);
  const before = g.room.state;
  const rent = before.rent!;
  const { events } = await g.command('PayRent');
  const applied = payload<{ steps: { tier: number; kind: string; assetId: string; amount: number }[]; raised: number; cashBefore: number }>(events, 'LiquidationApplied');
  expect(applied.cashBefore).toBe(rent.amount - 10);
  expect(applied.steps).toHaveLength(1);
  expect(applied.steps[0]).toMatchObject({ tier, kind: tier === 3 ? 'sell-house' : 'mortgage' });
  expect(payload(events, 'RentPaid')).toEqual({ payerId: rent.payerId, ownerId: rent.ownerId, assetId: rent.assetId, amount: rent.amount, auto: false });
  expect(g.room.state.balances[rent.payerId]).toBe(rent.amount - 10 + applied.raised - rent.amount);
  expect(g.room.state.balances[rent.ownerId]).toBe(before.balances[rent.ownerId]! + rent.amount);
  const step = applied.steps[0]!;
  if (tier === 3) expect(g.room.state.houses[step.assetId] ?? 0).toBe(before.houses[step.assetId]! - 1);
  else expect(g.room.state.mortgages[step.assetId]).toMatchObject({ advance: step.amount, lapsCompleted: 0 });
  expect(g.room.state.rent).toBeNull();
});

it('bankruptcy pays the creditor partially, frees the assets and keeps the bankrupt guest as spectator', async () => {
  const g = await fixture('bankruptcy');
  const before = g.room.state;
  const rent = before.rent!;
  const freed = Object.keys(before.owners).filter(a => before.owners[a] === rent.payerId);
  const { events } = await g.command('PayRent');
  expect(payload(events, 'PlayerBankrupt')).toEqual({ playerId: rent.payerId, creditorId: rent.ownerId, debt: rent.amount, paid: 10, writtenOff: rent.amount - 10 });
  expect(payload(events, 'AssetsReleased')).toEqual({ playerId: rent.payerId, assetIds: freed, reason: 'bankrupt' });
  expect(g.room.state.balances[rent.ownerId]).toBe(before.balances[rent.ownerId]! + 10);
  expect(g.room.state.balances[rent.payerId]).toBe(0);
  for (const assetId of freed) expect(g.room.state.owners[assetId]).toBeUndefined();
  expect(g.room.state.mortgages).toEqual({});
  expect(g.room.state.eliminations).toEqual([{ playerId: rent.payerId, reason: 'bankrupt', at: g.server.clock.now(), creditorId: rent.ownerId }]);
  expect(g.room.state.phase).toBe('playing');
  expect(await h.db.selectFrom('game_results').selectAll().execute()).toEqual([]);
  // The next active player continues; the bankrupt guest still receives Updates (checked in command()).
  expect(g.room.state.turn!.playerId).not.toBe(rent.payerId);
  await g.command('RollDice');
});

it('terminal bankruptcy commits the result row with the log, status and final snapshot', async () => {
  const g = await fixture('final-bankruptcy');
  const rent = g.room.state.rent!;
  const paid = await g.command('PayRent');
  const ended = payload<GameEndedEvent['payload']>(paid.events, 'GameEnded');
  expect(ended.winner).toBe(rent.ownerId);
  expect(ended.eliminations.map(e => [e.playerId, e.reason])).toEqual([
    [g.guests.find(x => x.guestId !== rent.payerId && x.guestId !== rent.ownerId)!.guestId, 'resigned'],
    [rent.payerId, 'bankrupt'],
  ]);
  const stored = await rows(g.id);
  expect(stored.rooms[0]!.status).toBe('finished');
  expect(stored.snapshots.at(-1)!.revision).toBe(g.room.state.revision);
  expect(stored.snapshots.at(-1)!.state).toEqual(g.room.state);
  expect(stored.results).toEqual([{
    room_id: g.id, rules_version: CURRENT_RULES_VERSION, winner_id: rent.ownerId, finished_at: new Date(ended.at),
    final_revision: g.room.state.revision, eliminations: ended.eliminations, final_balances: ended.finalBalances,
    created_at: expect.any(Date),
  }]);
  expect(ended.finalBalances).toEqual(g.room.state.balances);
  for (const client of g.clients) expect(client.socket.frames.filter(f => f.t === 'Update').at(-1)).toMatchObject({
    view: { phase: 'finished', result: { winner: rent.ownerId, finishedAt: ended.at, eliminations: ended.eliminations, finalBalances: ended.finalBalances } } });
  expect(g.server.clock.pending).toEqual([]);

  const counts = g.clients.map(c => c.socket.frames.length);
  paid.socket.send(paid.frame);
  expect(await paid.socket.nextOf('Ack')).toEqual(paid.ack);
  expect(await rows(g.id)).toEqual(stored);
  for (const [i, client] of g.clients.entries()) expect(client.socket.frames.slice(counts[i]).some(f => f.t === 'Update')).toBe(false);
});

it('terminal resignation stores its result with the resigned elimination order', async () => {
  const g = await fixture('final-bankruptcy');
  const rent = g.room.state.rent!;
  const { events } = await g.command('Resign', null, { by: rent.payerId });
  const ended = payload<GameEndedEvent['payload']>(events, 'GameEnded');
  expect(ended.eliminations.map(e => e.reason)).toEqual(['resigned', 'resigned']);
  const result = await h.db.selectFrom('game_results').selectAll().where('room_id', '=', g.id).executeTakeFirstOrThrow();
  expect(result).toMatchObject({ winner_id: rent.ownerId, final_revision: g.room.state.revision, eliminations: ended.eliminations, final_balances: ended.finalBalances });
});

it.each(['game_results', 'game_snapshots'])('a failed %s insert rolls the terminal command back and broadcasts nothing', async table => {
  const g = await fixture('final-bankruptcy');
  const before = g.room.state;
  await sql.raw(`CREATE FUNCTION reject_terminal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected ${table} failure'; END $$`).execute(h.db);
  await sql.raw(`CREATE TRIGGER terminal_failure BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION reject_terminal()`).execute(h.db);
  await g.command('PayRent', null, { error: 'PERSISTENCE_FAILED' });
  expect(g.room.state).toEqual(before);
  expect(await h.db.selectFrom('game_results').selectAll().execute()).toEqual([]);
  expect((await rows(g.id)).rooms[0]!.status).toBe('playing');
  expect(await logEntries(h.db, g.id)).toEqual([]);

  await sql.raw('DROP TRIGGER terminal_failure ON ' + table).execute(h.db);
  await g.command('PayRent');
  expect(g.room.state.phase).toBe('finished');
  expect(await h.db.selectFrom('game_results').selectAll().execute()).toHaveLength(1);
});
