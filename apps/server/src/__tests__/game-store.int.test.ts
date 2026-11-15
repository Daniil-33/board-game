import { CURRENT_RULES_VERSION } from '@game/game-core';
import { describe, expect, it } from 'vitest';
import { canonicalJson, createSession, gameEngine, restoreSession, type GameState } from '@game/game-core';
import { CorruptGameDataError, createGameStore } from '../db/game-store.js';
import { seededEntropy } from './helpers/seeded-entropy.js';
import { logEntries, roomStatus, seedRoom, snapshotRevisions } from './helpers/db.js';
import { T0, nextMove, sys } from './helpers/game.js';
import { useHarness } from './helpers/harness.js';
import { timestamp } from '@game/game-core';
import { sql } from 'kysely';

const h = useHarness();

/** A core session played to `revision`, with the state after every revision. */
function played(revision: number) {
  const session = createSession(gameEngine);
  const entropy = seededEntropy(3);
  const states = new Map<number, GameState>();
  const run = (command: Parameters<typeof session.submit>[0]) => {
    const result = session.submit(command, { now: timestamp(T0), entropy: entropy.next() });
    if (result.kind !== 'accepted') throw new Error(result.error.code);
    states.set(result.revision, result.state);
  };
  run(sys('CreateGame', { seed: 9, rulesVersion: CURRENT_RULES_VERSION }, 0));
  run(sys('AddPlayer', { playerId: 'a' }, 1));
  run(sys('AddPlayer', { playerId: '__proto__' }, 2));
  run(sys('StartGame', null, 3));
  while (session.state.revision < revision) run(nextMove(session.state));
  return { session, states };
}

// spec: server/persistence "Schema", "Snapshot policy", "Room status follows the log"
describe('game store', () => {
  it('round-trips log entries by canonical JSON', async () => {
    const store = createGameStore(h.db);
    const gameId = await seedRoom(h.db);
    const { session } = played(12);
    for (const entry of session.log) await store.appendEntry(gameId, entry, { markPlaying: false, snapshot: null });
    const stored = await logEntries(h.db, gameId);
    expect(stored.map((e) => canonicalJson(e))).toEqual(session.log.map((e) => canonicalJson(e)));
    expect(canonicalJson(await store.findEntryByCommandId(gameId, session.log[4]!.command.commandId))).toBe(
      canonicalJson(session.log[4]),
    );
    expect(await store.findEntryByCommandId(gameId, 'unknown')).toBeUndefined();
  });

  it('loads the latest snapshot and only the entries after it', async () => {
    const store = createGameStore(h.db);
    const gameId = await seedRoom(h.db);
    const { session, states } = played(12);

    expect(await store.loadGame(gameId)).toEqual({ snapshot: null, tail: [] });

    for (const entry of session.log) {
      await store.appendEntry(gameId, entry, {
        markPlaying: entry.revision === 4,
        snapshot: entry.revision === 4 || entry.revision === 9 ? states.get(entry.revision)! : null,
      });
    }
    const loaded = await store.loadGame(gameId);
    expect(loaded.snapshot?.revision).toBe(9);
    expect(loaded.tail.map((e) => e.revision)).toEqual([10, 11, 12]);
    expect(restoreSession(gameEngine, loaded.snapshot!, loaded.tail).state).toEqual(session.state);
    expect(await roomStatus(h.db, gameId)).toBe('playing');
  });

  it('without a snapshot the tail is the whole log', async () => {
    const store = createGameStore(h.db);
    const gameId = await seedRoom(h.db);
    const { session } = played(6);
    for (const entry of session.log) await store.appendEntry(gameId, entry, { markPlaying: false, snapshot: null });
    const loaded = await store.loadGame(gameId);
    expect(loaded.snapshot).toBeNull();
    expect(loaded.tail.map((e) => e.revision)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(await roomStatus(h.db, gameId)).toBe('lobby');
  });

  it('a failed append writes neither the entry, the status nor the snapshot', async () => {
    const store = createGameStore(h.db);
    const gameId = await seedRoom(h.db);
    const { session, states } = played(4);
    await store.appendEntry(gameId, session.log[0]!, { markPlaying: false, snapshot: null });
    // Same command id at a new revision: the insert conflicts.
    const clash = { ...session.log[3]!, command: { ...session.log[3]!.command, commandId: session.log[0]!.command.commandId } };
    await expect(store.appendEntry(gameId, clash, { markPlaying: true, snapshot: states.get(4)! })).rejects.toMatchObject({
      code: '23505',
    });
    expect((await logEntries(h.db, gameId)).map((e) => e.revision)).toEqual([1]);
    expect(await roomStatus(h.db, gameId)).toBe('lobby');
    expect(await snapshotRevisions(h.db, gameId)).toEqual([]);
  });

  it('writing a snapshot twice for a revision is a no-op', async () => {
    const store = createGameStore(h.db);
    const gameId = await seedRoom(h.db);
    const { states } = played(5);
    await store.writeSnapshot(gameId, states.get(5)!);
    await store.writeSnapshot(gameId, states.get(5)!);
    await store.writeSnapshot(gameId, states.get(3)!);
    expect(await snapshotRevisions(h.db, gameId)).toEqual([3, 5]);
  });

  it('lists rooms in an active status and knows which rooms exist', async () => {
    const store = createGameStore(h.db);
    const a = await seedRoom(h.db);
    const b = await seedRoom(h.db);
    await h.db.updateTable('rooms').set({ status: 'playing' }).where('id', '=', b).execute();
    const ids = await store.listActiveRoomIds();
    expect(ids).toContain(a);
    expect(ids).toContain(b);
    expect(await store.roomExists(a)).toBe(true);
    expect(await store.roomExists('missing')).toBe(false);
  });

  it('rejects rows whose columns disagree with their JSON', async () => {
    const store = createGameStore(h.db);
    const gameId = await seedRoom(h.db);
    const { session } = played(3);
    for (const entry of session.log) await store.appendEntry(gameId, entry, { markPlaying: false, snapshot: null });
    await sql`update game_log set entry = jsonb_set(entry, '{revision}', '7') where game_id = ${gameId} and revision = 2`.execute(h.db);
    await expect(store.loadGame(gameId)).rejects.toBeInstanceOf(CorruptGameDataError);
  });
});
