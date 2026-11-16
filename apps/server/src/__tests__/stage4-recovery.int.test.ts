import { afterEach, expect, it } from 'vitest';
import { gameEngine, pendingDeadlines, projectState, timestamp, type GameState, type GameCommand, type PlayerId } from '@game/game-core';
import { sql } from 'kysely';
import { buildFixture } from '../test-fixtures.js';
import { createGuestStore } from '../auth/guests.js';
import { useHarness } from './helpers/harness.js';
import { cid, T0, whenIdle } from './helpers/game.js';
import { logEntries } from './helpers/db.js';
import { connect, startServer, stopServers } from './helpers/server.js';
import { seededEntropy } from './helpers/seeded-entropy.js';

const h = useHarness({ perTest: true });
afterEach(stopServers);

function command(state: GameState, type: string, payload: unknown = null): GameCommand {
  return { type, payload, commandId: cid(type), actor: { kind: 'player', id: state.turn!.playerId },
    expected: { kind: 'target', target: { kind: 'turn', id: state.turn!.turnId } } };
}
async function genesis(name = 'open-rent', landing = false) {
  const guests = await Promise.all(['a', 'b', 'c'].map(n => createGuestStore(h.db).create(n)));
  let state = buildFixture(name as never, guests.map(g => g.guestId), T0);
  if (landing) {
    // Choose a pre-roll position using the same injected entropy as the first host command.
    const owner = guests.find(g => g.guestId !== state.turn!.playerId)!.guestId as PlayerId;
    state = { ...state, rent: null, turn: { ...state.turn!, rolled: false },
      owners: Object.fromEntries(state.board!.cells.filter(c => c.asset).map(c => [c.asset!.assetId, owner])) };
    let selected: GameState | undefined;
    for (let position = 0; position < 40; position++) {
      const candidate = { ...state, positions: { ...state.positions, [state.turn!.playerId]: position } };
      const result = gameEngine.execute(candidate, command(candidate, 'RollDice'), { now: timestamp(T0), entropy: seededEntropy(1).next() });
      if (result.kind === 'accepted' && result.state.rent) { selected = candidate; break; }
    }
    if (!selected) throw new Error('No rent landing found');
    state = selected;
  }
  const id = cid('room');
  await h.db.insertInto('rooms').values({ id, creator_id: guests[0]!.guestId, status: 'playing' }).execute();
  await h.db.insertInto('room_members').values(guests.map(g => ({ room_id: id, guest_id: g.guestId }))).execute();
  await h.db.insertInto('game_snapshots').values({ game_id: id, revision: state.revision, state: sql`${JSON.stringify(state)}::jsonb` }).execute();
  return { id, state, guests };
}

it.each(['open-rent', 'building'])('clean restart and reconnect preserve full %s state and all guest views', async name => {
  const g = await genesis(name);
  const server = await startServer(h);
  const room = await server.manager.open(g.id);
  if (name === 'building') {
    expect(await room.submit(command(room.state, 'BuildHouse', { assetId: Object.keys(room.state.owners)[0] }))).toMatchObject({ kind: 'accepted' });
    expect(room.state.turn!.quotas.builds).toBe(0);
  }
  const before = room.state;
  await server.stop();
  const restored = await startServer(h, { restore: true });
  expect(restored.manager.get(g.id)!.state).toEqual(before);
  expect(restored.clock.pending).toEqual(pendingDeadlines(before).map(d => d.at));
  for (const guest of g.guests) {
    const client = await connect(restored, guest, g.id, before.revision);
    expect(client.welcome.view).toEqual(projectState(before, { kind: 'player', id: guest.guestId as never }));
  }
});

it.each(['rent', 'build'])('crash-style snapshot before %s plus log tail restores exact state', async phase => {
  const g = await genesis(phase === 'build' ? 'building' : 'open-rent', phase === 'rent');
  const first = h.manager({ seed: 1 });
  const room = await first.manager.open(g.id);
  const type = phase === 'build' ? 'BuildHouse' : 'RollDice';
  expect(await room.submit(command(room.state, type, phase === 'build' ? { assetId: Object.keys(room.state.owners)[0] } : null))).toMatchObject({ kind: 'accepted' });
  const before = room.state;
  if (phase === 'rent') expect(before.rent).not.toBeNull();
  else expect(Object.values(before.houses)).toContain(1);
  const stored = await first.store.loadGame(g.id);
  expect(stored.snapshot).toEqual(g.state);
  expect(stored.tail).toHaveLength(1);
  const second = h.manager({ seed: 2 });
  expect(await second.manager.restoreAll()).toEqual({ restored: [g.id], failed: [] });
  const recovered = second.manager.get(g.id)!;
  expect(recovered.state).toEqual(before);
  for (const guest of g.guests) expect(projectState(recovered.state, { kind: 'player', id: guest.guestId as never }))
    .toEqual(projectState(before, { kind: 'player', id: guest.guestId as never }));
  expect(await second.store.loadGame(g.id)).toEqual(stored);
});

it.each([false, true])('deadline payment with overdue boot=%s persists exactly once and broadcasts', async overdue => {
  const g = await genesis();
  const deadline = g.state.turn!.deadline;
  const server = await startServer(h, overdue ? { restore: true, now: deadline + 1 } : {});
  const room = await server.manager.open(g.id);
  const clients = overdue ? [] : await Promise.all(g.guests.map(guest => connect(server, guest, g.id)));
  if (!overdue) {
    server.clock.advance(deadline - server.clock.now() - 1);
    await whenIdle(room);
    expect(room.state).toEqual(g.state);
    server.clock.advance(1);
  }
  await whenIdle(room);
  expect(room.state.rent).toBeNull();
  expect(room.state.turn!.turnId).not.toBe(g.state.turn!.turnId);
  const entries = await logEntries(h.db, g.id);
  expect(entries).toHaveLength(1);
  expect(entries[0]!.command.type).toBe('Timeout');
  expect(entries[0]!.events.filter(e => e.type === 'RentPaid')).toHaveLength(1);
  expect(entries[0]!.events.find(e => e.type === 'RentPaid')!.payload).toMatchObject({ auto: true });
  for (const [i, client] of clients.entries()) {
    const update = await client.socket.nextOf('Update');
    expect(update.events).toEqual(entries[0]!.events);
    expect(update.view).toEqual(projectState(room.state, { kind: 'player', id: g.guests[i]!.guestId as never }));
  }
  expect(server.clock.pending).toEqual(pendingDeadlines(room.state).map(d => d.at));
  await whenIdle(room);
  expect(await logEntries(h.db, g.id)).toEqual(entries);
});
