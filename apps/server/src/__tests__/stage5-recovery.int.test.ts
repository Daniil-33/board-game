import { afterEach, expect, it } from 'vitest';
import { gameEngine, pendingDeadlines, projectState, type GameCommand, type GameState, type LogEntry, type PlayerId } from '@game/game-core';
import { sql } from 'kysely';
import { buildFixture, type FixtureName } from '../test-fixtures.js';
import { createGuestStore } from '../auth/guests.js';
import { useHarness } from './helpers/harness.js';
import { cid, T0, whenIdle } from './helpers/game.js';
import { logEntries } from './helpers/db.js';
import { connect, startServer, stopServers } from './helpers/server.js';

const h = useHarness({ perTest: true });
afterEach(stopServers);

function command(state: GameState, type: string): GameCommand {
  return { type, payload: null, commandId: cid(type), actor: { kind: 'player', id: state.turn!.playerId },
    expected: { kind: 'target', target: { kind: 'turn', id: state.turn!.turnId } } };
}
async function genesis(name: FixtureName) {
  const guests = await Promise.all(['a', 'b', 'c'].map(n => createGuestStore(h.db).create(n)));
  const state = buildFixture(name, guests.map(g => g.guestId), T0);
  const id = cid('room');
  await h.db.insertInto('rooms').values({ id, creator_id: guests[0]!.guestId, status: 'playing' }).execute();
  await h.db.insertInto('room_members').values(guests.map(g => ({ room_id: id, guest_id: g.guestId }))).execute();
  await h.db.insertInto('game_snapshots').values({ game_id: id, revision: state.revision, state: sql`${JSON.stringify(state)}::jsonb` }).execute();
  return { id, state, guests };
}
/** The logged boundary replayed from the uninterrupted state: the same state and events. */
function expectSameBoundary(before: GameState, entry: LogEntry, after: GameState) {
  const replayed = gameEngine.execute(before, entry.command, { now: entry.now, entropy: entry.entropy });
  expect(replayed.kind).toBe('accepted');
  if (replayed.kind !== 'accepted') return;
  expect(replayed.state).toEqual(after);
  expect(replayed.events).toEqual(entry.events);
}
const views = (state: GameState, guests: readonly { guestId: string }[]) =>
  guests.map(g => projectState(state, { kind: 'player', id: g.guestId as PlayerId }));

it('clean restart keeps mortgages, all three views and the next boundary with expiry', async () => {
  const g = await genesis('mortgage-restart');
  const server = await startServer(h);
  const room = await server.manager.open(g.id);
  const before = room.state;
  expect(Object.values(before.mortgages).map(m => m.lapsCompleted).sort()).toEqual([3, 7]);
  await server.stop();

  const restored = await startServer(h, { restore: true });
  const recovered = restored.manager.get(g.id)!;
  expect(recovered.state).toEqual(before);
  expect(restored.clock.pending).toEqual(pendingDeadlines(before).map(d => d.at));
  const clients = await Promise.all(g.guests.map(guest => connect(restored, guest, g.id, before.revision)));
  expect(clients.map(c => c.welcome.view)).toEqual(views(before, g.guests));

  expect(await recovered.submit(command(recovered.state, 'EndTurn'))).toMatchObject({ kind: 'accepted' });
  const entry = (await logEntries(h.db, g.id)).at(-1)!;
  expect(entry.events.filter(e => e.type === 'MortgageExpired')).toHaveLength(1);
  expect(Object.values(recovered.state.mortgages)).toEqual([expect.objectContaining({ lapsCompleted: 3 })]);
  expectSameBoundary(before, entry, recovered.state);
  for (const [i, client] of clients.entries()) {
    expect((await client.socket.nextOf('Update')).view).toEqual(views(recovered.state, g.guests)[i]);
  }
});

it('a snapshot plus a tail that moved mortgage progress restores exactly and advances identically at the next boundary', async () => {
  const g = await genesis('mortgage-restart');
  const first = h.manager({ seed: 1 });
  const room = await first.manager.open(g.id);
  // Tail: the payer's boundary expires one term and advances the other's pending players.
  expect(await room.submit(command(room.state, 'EndTurn'))).toMatchObject({ kind: 'accepted' });
  const before = room.state;
  const [term] = Object.values(before.mortgages);
  expect(term!.pending).toHaveLength(2);
  const stored = await first.store.loadGame(g.id);
  expect(stored.snapshot).toEqual(g.state);
  expect(stored.tail).toHaveLength(1);

  // Crash-style: no shutdown snapshot; a second process restores from snapshot plus tail.
  const second = h.manager({ seed: 2 });
  expect(await second.manager.restoreAll()).toEqual({ restored: [g.id], failed: [] });
  const recovered = second.manager.get(g.id)!;
  expect(recovered.state).toEqual(before);
  expect(views(recovered.state, g.guests)).toEqual(views(before, g.guests));
  // The next boundary closes the next player's turn by its deadline (possibly after a continuation).
  for (let i = 0; i < 5 && recovered.state.turn!.turnId === before.turn!.turnId; i++) {
    second.clock.advance(Math.max(0, Math.min(...second.clock.pending) - second.clock.now()));
    await whenIdle(recovered);
  }
  const tail = (await logEntries(h.db, g.id)).slice(1);
  expect(tail.length).toBeGreaterThan(0);
  expect(tail.every(e => e.command.type === 'Timeout')).toBe(true);
  let replayed = before;
  for (const entry of tail) {
    const next = gameEngine.execute(replayed, entry.command, { now: entry.now, entropy: entry.entropy });
    if (next.kind !== 'accepted') throw new Error(next.error.code);
    expect(next.events).toEqual(entry.events);
    replayed = next.state;
  }
  expect(replayed).toEqual(recovered.state);
  expect(recovered.state.turn!.turnId).not.toBe(before.turn!.turnId);
  expect(Object.values(recovered.state.mortgages)[0]!.pending).toHaveLength(1);
});

it('a finished room reloads after restart with its final view and result for every guest and no timers', async () => {
  const g = await genesis('final-bankruptcy');
  const server = await startServer(h);
  const room = await server.manager.open(g.id);
  const pay = command(room.state, 'PayRent');
  const paid = await room.submit(pay);
  expect(paid).toMatchObject({ kind: 'accepted' });
  const final = room.state;
  expect(final.phase).toBe('finished');
  const result = await h.db.selectFrom('game_results').selectAll().execute();
  expect(result).toHaveLength(1);
  const log = await logEntries(h.db, g.id);
  await server.stop();

  const restored = await startServer(h, { restore: true });
  expect(restored.manager.get(g.id)).toBeUndefined();
  for (const [i, guest] of g.guests.entries()) {
    const client = await connect(restored, guest, g.id, null);
    expect(client.welcome.revision).toBe(final.revision);
    expect(client.welcome.view).toEqual(views(final, g.guests)[i]);
    expect(client.welcome.view.result).toEqual({ winner: final.winner, finishedAt: final.finishedAt,
      eliminations: final.eliminations, finalBalances: final.balances });
  }
  expect(final.eliminated).toHaveLength(2);
  const reloaded = restored.manager.get(g.id)!;
  expect(reloaded.state).toEqual(final);
  expect(restored.clock.pending).toEqual([]);
  // The terminal command stays deduplicated after restart.
  expect(await reloaded.submit(pay)).toEqual(paid.kind === 'accepted' ? { ...paid, duplicate: true } : paid);
  expect(await h.db.selectFrom('game_results').selectAll().execute()).toEqual(result);
  expect(await logEntries(h.db, g.id)).toEqual(log);
  expect((await h.db.selectFrom('rooms').select('status').where('id', '=', g.id).executeTakeFirstOrThrow()).status).toBe('finished');
});
