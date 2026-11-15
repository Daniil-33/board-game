import { describe, expect, it } from 'vitest';
import { gameEngine, genesis, restoreSession } from '@game/game-core';
import type { GameStore } from '../db/game-store.js';
import { logEntries, roomStatus, seedRoom, snapshotRevisions } from './helpers/db.js';
import { addPlayer, lobby, nextMove, startGame, sys } from './helpers/game.js';
import { record, useHarness } from './helpers/harness.js';

const h = useHarness();

/** The real store, with `appendEntry` (and optionally `loadGame`) failing while `broken` is set. */
function breakable(options: { load?: boolean } = {}) {
  const control = { broken: false };
  const wrap = (store: GameStore): GameStore => ({
    ...store,
    async appendEntry(...args) {
      if (control.broken) throw new Error('disk on fire');
      return store.appendEntry(...args);
    },
    async loadGame(gameId) {
      if (control.broken && options.load) throw new Error('database unreachable');
      return store.loadGame(gameId);
    },
  });
  return { control, wrap };
}

// spec: server/rooms "Persistence failure", "Unavailable room"; server/persistence "Room status follows the log"
describe('persistence failure', () => {
  it('a failing insert rejects with PERSISTENCE_FAILED and leaves the room equal to the database', async () => {
    const { control, wrap } = breakable();
    const { manager, store, logger } = h.manager({ wrapStore: wrap });
    const gameId = await seedRoom(h.db);
    const room = await manager.open(gameId);
    await lobby(room); // revision 3
    const events = record(room);

    control.broken = true;
    const command = sys('AddPlayer', { playerId: 'c' }, 3);
    const result = await room.submit(command);

    expect(result).toMatchObject({ kind: 'rejected', revision: 3, error: { code: 'PERSISTENCE_FAILED' } });
    expect(events).toEqual([]); // no update, and no resync: subscribers already hold revision 3
    expect(room.status).toBe('live');
    control.broken = false;
    const fromDb = await store.loadGame(gameId);
    expect(room.state).toEqual(restoreSession(gameEngine, fromDb.snapshot ?? genesis(), fromDb.tail).state);
    expect(room.state.players.map((p) => p.id)).toEqual(['a', 'b']);
    expect(await logEntries(h.db, gameId)).toHaveLength(3);
    expect(logger.lines.some((l) => l.level === 'warn' && l.message === 'log write failed')).toBe(true);

    // The command was never persisted, so the same delivery can succeed later.
    expect(await room.submit(command)).toMatchObject({ kind: 'accepted', revision: 4, duplicate: false });
    expect(events).toMatchObject([{ kind: 'update', revision: 4 }]);
  });

  it('a second writer taking the revision gives PERSISTENCE_FAILED and a resync to its state', async () => {
    const { manager, logger } = h.manager();
    const gameId = await seedRoom(h.db);
    const room = await manager.open(gameId);
    await lobby(room); // revision 3
    const events = record(room);

    // Another process on the same game, also at revision 3, commits first.
    const other = await h.room(gameId, { seed: 99 });
    expect(other.room.state.revision).toBe(3);
    await addPlayer(other.room, 'theirs');

    const result = await room.submit(sys('AddPlayer', { playerId: 'ours' }, 3));

    expect(result).toMatchObject({ kind: 'rejected', revision: 4, error: { code: 'PERSISTENCE_FAILED' } });
    expect(room.state).toEqual(other.room.state);
    expect(room.state.players.map((p) => p.id)).toEqual(['a', 'b', 'theirs']);
    expect(events).toEqual([{ kind: 'resync', revision: 4, state: room.state }]);
    const log = await logEntries(h.db, gameId);
    expect(log.filter((e) => e.revision === 4)).toHaveLength(1);
    expect(log).toHaveLength(4);
    expect(logger.lines.some((l) => l.message === 'log write conflicted with another writer')).toBe(true);

    // The room goes on from the other writer's state.
    expect(await room.submit(sys('AddPlayer', { playerId: 'ours' }, 4))).toMatchObject({ kind: 'accepted', revision: 5 });
  });

  it('a command id taken by a second writer is a conflict too, never a second row', async () => {
    const { manager } = h.manager();
    const gameId = await seedRoom(h.db);
    const room = await manager.open(gameId);
    await lobby(room);
    const other = await h.room(gameId, { seed: 99 });

    // Both run the lookup before either writes, so only the unique index can stop the second.
    const mine = room.submit(sys('AddPlayer', { playerId: 'x' }, 3, 'shared-id'));
    const theirs = other.room.submit(sys('AddPlayer', { playerId: 'x' }, 3, 'shared-id'));
    const results = await Promise.all([mine, theirs]);

    const kinds = results.map((r) => (r.kind === 'accepted' ? (r.duplicate ? 'duplicate' : 'accepted') : r.error.code));
    expect(kinds.filter((k) => k === 'accepted')).toHaveLength(1);
    expect(['PERSISTENCE_FAILED', 'duplicate']).toContain(kinds.find((k) => k !== 'accepted'));
    const log = await logEntries(h.db, gameId);
    expect(log.filter((e) => e.command.commandId === 'shared-id')).toHaveLength(1);
    expect(log).toHaveLength(4);
  });

  it('when the reload fails too the room is failed and rejects everything', async () => {
    const { control, wrap } = breakable({ load: true });
    const { manager, logger } = h.manager({ wrapStore: wrap });
    const gameId = await seedRoom(h.db);
    const room = await manager.open(gameId);
    await lobby(room);
    await startGame(room);
    const events = record(room);

    control.broken = true;
    const first = room.submit(sys('Whatever', null, 4)); // rejected by the core, harmless
    const failing = room.submit(nextMove(room.state)); // accepted by the core, cannot be written
    const queued = room.submit(sys('AddPlayer', { playerId: 'late' }, 5));
    expect((await first).kind).toBe('rejected');
    expect(await failing).toMatchObject({ kind: 'rejected', error: { code: 'PERSISTENCE_FAILED' } });
    expect(await queued).toMatchObject({ kind: 'rejected', error: { code: 'ROOM_UNAVAILABLE' } });

    expect(room.status).toBe('failed');
    expect(events).toMatchObject([{ kind: 'failed' }]);
    expect(logger.lines.some((l) => l.level === 'error' && l.message === 'room failed' && l.fields['gameId'] === gameId)).toBe(true);

    control.broken = false;
    const before = await logEntries(h.db, gameId);
    expect(await room.submit(sys('AddPlayer', { playerId: 'later' }, 4))).toMatchObject({
      kind: 'rejected',
      error: { code: 'ROOM_UNAVAILABLE' },
    });
    expect(await logEntries(h.db, gameId)).toEqual(before);
    expect(manager.get(gameId)?.status).toBe('failed');
  });

  it('rooms.status stays lobby and no snapshot is written when the StartGame insert fails', async () => {
    const { control, wrap } = breakable();
    const { manager } = h.manager({ wrapStore: wrap });
    const gameId = await seedRoom(h.db);
    const room = await manager.open(gameId);
    await lobby(room);

    control.broken = true;
    expect(await room.submit(sys('StartGame', null, 3))).toMatchObject({ kind: 'rejected', error: { code: 'PERSISTENCE_FAILED' } });
    expect(await roomStatus(h.db, gameId)).toBe('lobby');
    expect(await snapshotRevisions(h.db, gameId)).toEqual([]);
    expect(room.state.phase).toBe('lobby');

    control.broken = false;
    const started = await startGame(room);
    expect(await roomStatus(h.db, gameId)).toBe('playing');
    expect(await snapshotRevisions(h.db, gameId)).toEqual([started.revision]);
  });

  it('a failed lookup rejects without executing and the room stays live', async () => {
    let broken = false;
    const { manager } = h.manager({
      wrapStore: (store) => ({
        ...store,
        async findEntryByCommandId(...args) {
          if (broken) throw new Error('connection reset');
          return store.findEntryByCommandId(...args);
        },
      }),
    });
    const gameId = await seedRoom(h.db);
    const room = await manager.open(gameId);
    await lobby(room);
    const events = record(room);

    broken = true;
    expect(await room.submit(sys('AddPlayer', { playerId: 'c' }, 3))).toMatchObject({
      kind: 'rejected',
      revision: 3,
      error: { code: 'PERSISTENCE_FAILED' },
    });
    broken = false;
    expect(room.status).toBe('live');
    expect(events).toEqual([]);
    expect(await logEntries(h.db, gameId)).toHaveLength(3);
    await addPlayer(room, 'c');
  });
});
