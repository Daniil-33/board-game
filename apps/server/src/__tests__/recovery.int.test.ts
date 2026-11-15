import { CURRENT_RULES_VERSION } from '@game/game-core';
import { describe, expect, it } from 'vitest';
import { genesis, SETUP_ROLL_DURATION_MS, TURN_DURATION_MS, type CommandId } from '@game/game-core';
import { sql } from 'kysely';
import { RoomManagerClosedError, RoomNotFoundError } from '../rooms/types.js';
import { SNAPSHOT_INTERVAL } from '../rooms/room.js';
import { logEntries, roomStatus, seedRoom, snapshotRevisions } from './helpers/db.js';
import { addPlayer, createGame, lobby, nextMove, ok, playingGame, playTo, startGame, step, sys, T0, whenIdle } from './helpers/game.js';
import { gatedStore, record, useHarness } from './helpers/harness.js';

// Every test gets its own database: `restoreAll` loads every active room in it.
const h = useHarness({ perTest: true });

const rows = async (gameId: string) => ({
  log: await h.db.selectFrom('game_log').selectAll().where('game_id', '=', gameId).orderBy('revision').execute(),
  snapshots: await h.db.selectFrom('game_snapshots').selectAll().where('game_id', '=', gameId).orderBy('revision').execute(),
});

// spec: server/recovery; server/persistence "Snapshot policy"; server/timers "Overdue deadlines fire immediately";
// server/rooms "Duplicate delivery" (after restart)
describe('recovery', () => {
  it('restores a game played past a snapshot to exactly the live state', async () => {
    const first = h.manager();
    const gameId = await seedRoom(h.db);
    const live = await first.manager.open(gameId);
    await playingGame(live, ['a', 'b', 'c']);
    await playTo(live, SNAPSHOT_INTERVAL + 7);
    expect(await snapshotRevisions(h.db, gameId)).toEqual([5, SNAPSHOT_INTERVAL]);

    // A new process on the same database; the first one is simply gone (no shutdown).
    const second = h.manager({ seed: 2 });
    expect(await second.manager.restoreAll()).toEqual({ restored: [gameId], failed: [] });
    const restored = second.manager.get(gameId)!;
    expect(restored.status).toBe('live');
    expect(restored.state).toEqual(live.state);
    expect(second.clock.pending).toEqual([live.state.turn!.deadline]);

    // Both continue identically from here.
    const move = await step(restored);
    expect(move.revision).toBe(SNAPSHOT_INTERVAL + 8);
    expect(await logEntries(h.db, gameId)).toHaveLength(SNAPSHOT_INTERVAL + 8);
  });

  it('restores a lobby game that has no snapshot, and a new room as genesis', async () => {
    const first = h.manager();
    const inLobby = await seedRoom(h.db);
    const empty = await seedRoom(h.db);
    const live = await first.manager.open(inLobby);
    await lobby(live, ['a', 'b', 'c']);
    expect(await snapshotRevisions(h.db, inLobby)).toEqual([]);

    const second = h.manager({ seed: 2 });
    const result = await second.manager.restoreAll();
    expect(result.failed).toEqual([]);
    expect([...result.restored].sort()).toEqual([inLobby, empty].sort());
    expect(second.manager.get(inLobby)!.state).toEqual(live.state);
    expect(second.manager.get(empty)!.state).toEqual(genesis());
    expect(second.clock.pending).toEqual([]);

    // `open` gives the same room object, and a fresh manager opens on demand.
    expect(await second.manager.open(inLobby)).toBe(second.manager.get(inLobby));
    const third = h.manager({ seed: 3 });
    const [x, y] = await Promise.all([third.manager.open(inLobby), third.manager.open(inLobby)]);
    expect(x).toBe(y);
    expect(x.state).toEqual(live.state);
  });

  it('restores several rooms at their own revisions and arms their timers', async () => {
    const first = h.manager();
    const one = await seedRoom(h.db);
    const two = await seedRoom(h.db);
    const roomOne = await first.manager.open(one);
    const roomTwo = await first.manager.open(two);
    await lobby(roomOne);
    await startGame(roomOne); // setup, revision 4
    first.clock.advance(3000);
    await playingGame(roomTwo, ['x', 'y', 'z'], 7);
    await playTo(roomTwo, 15);

    const second = h.manager({ seed: 2 });
    const result = await second.manager.restoreAll();
    expect([...result.restored].sort()).toEqual([one, two].sort());
    expect(second.manager.get(one)!.state).toEqual(roomOne.state);
    expect(second.manager.get(two)!.state).toEqual(roomTwo.state);
    expect(second.manager.get(one)!.state.revision).toBe(4);
    expect(second.manager.get(two)!.state.revision).toBe(15);
    expect(second.clock.pending).toEqual([T0 + SETUP_ROLL_DURATION_MS, roomTwo.state.turn!.deadline].sort((a, b) => a - b));
  });

  it('a log that does not replay fails that room only, loudly, and touches no row', async () => {
    const first = h.manager();
    const bad = await seedRoom(h.db);
    const good = await seedRoom(h.db);
    const badRoom = await first.manager.open(bad);
    const goodRoom = await first.manager.open(good);
    await playingGame(badRoom);
    await playTo(badRoom, 12);
    await playingGame(goodRoom);

    // Tamper with an entry after the game-start snapshot (revision 4).
    await sql`update game_log set entry = jsonb_set(entry, '{events}', '[]') where game_id = ${bad} and revision = 9`.execute(h.db);
    const before = await rows(bad);

    const second = h.manager({ seed: 2 });
    const result = await second.manager.restoreAll();
    expect(result).toEqual({ restored: [good], failed: [bad] });

    const failed = second.manager.get(bad)!;
    expect(failed.status).toBe('failed');
    expect(await failed.submit(sys('AddPlayer', { playerId: 'q' }, 12))).toMatchObject({
      kind: 'rejected',
      error: { code: 'ROOM_UNAVAILABLE' },
    });
    const errors = second.logger.lines.filter((l) => l.level === 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      message: 'room could not be restored',
      fields: { gameId: bad, errorName: 'ReplayDivergenceError', tailIndex: 4 },
    });
    expect(await rows(bad)).toEqual(before);
    expect(await roomStatus(h.db, bad)).toBe('playing');

    const healthy = second.manager.get(good)!;
    expect(healthy.status).toBe('live');
    expect(healthy.state).toEqual(goodRoom.state);
    await step(healthy);

    // Not a silent reset: even a clean shutdown writes nothing for the failed room.
    await second.manager.shutdown();
    expect(await rows(bad)).toEqual(before);
  });

  it('a corrupt snapshot fails the room as well', async () => {
    const first = h.manager();
    const gameId = await seedRoom(h.db);
    const room = await first.manager.open(gameId);
    await lobby(room);
    await startGame(room);
    await sql`update game_snapshots set state = jsonb_set(state, '{phase}', '"playing"') where game_id = ${gameId}`.execute(h.db);

    const second = h.manager({ seed: 2 });
    expect(await second.manager.restoreAll()).toEqual({ restored: [], failed: [gameId] });
    expect(second.logger.lines.filter((l) => l.level === 'error')[0]).toMatchObject({ fields: { gameId } });

    // `open` on a fresh manager reports the same room as failed rather than throwing.
    const third = h.manager({ seed: 3 });
    expect((await third.manager.open(gameId)).status).toBe('failed');
  });

  it('opening an unknown room fails with RoomNotFoundError and creates nothing', async () => {
    const { manager } = h.manager();
    await expect(manager.open('no-such-room')).rejects.toBeInstanceOf(RoomNotFoundError);
    expect(manager.get('no-such-room')).toBeUndefined();
    expect(await h.db.selectFrom('rooms').selectAll().execute()).toEqual([]);
  });

  // Review RVW-002: an unreadable room is not a bad room.
  it('a room that cannot be read at boot is reported, not registered, and opens later', async () => {
    const first = h.manager();
    const flaky = await seedRoom(h.db);
    const fine = await seedRoom(h.db);
    await lobby(await first.manager.open(flaky));
    await lobby(await first.manager.open(fine));

    let down = true;
    const second = h.manager({
      seed: 2,
      wrapStore: (store) => ({
        ...store,
        async loadGame(gameId) {
          if (down && gameId === flaky) throw new Error('connection reset');
          return store.loadGame(gameId);
        },
      }),
    });
    expect(await second.manager.restoreAll()).toEqual({ restored: [fine], failed: [flaky] });
    expect(second.manager.get(flaky)).toBeUndefined();
    expect(second.logger.lines.some((l) => l.level === 'error' && l.fields['gameId'] === flaky)).toBe(true);
    await expect(second.manager.open(flaky)).rejects.toThrow('connection reset');

    down = false;
    const room = await second.manager.open(flaky);
    expect(room.status).toBe('live');
    expect(room.state.revision).toBe(3);
  });

  it('boot fails loudly when the room list cannot be read', async () => {
    const { manager } = h.manager({
      wrapStore: (store) => ({
        ...store,
        listActiveRoomIds: () => Promise.reject(new Error('database unreachable')),
      }),
    });
    await expect(manager.restoreAll()).rejects.toThrow('database unreachable');
  });

  it('an overdue deadline fires right after restore, without the clock moving', async () => {
    const first = h.manager();
    const gameId = await seedRoom(h.db);
    const live = await first.manager.open(gameId);
    await playingGame(live);
    const turn = live.state.turn!;

    // The process was down across the deadline.
    const second = h.manager({ now: turn.deadline + 60_000, seed: 2 });
    await second.manager.restoreAll();
    const restored = second.manager.get(gameId)!;
    const events = record(restored);
    await whenIdle(restored);
    await whenIdle(restored);

    const log = await logEntries(h.db, gameId);
    const last = log[log.length - 1]!;
    expect(last.command).toMatchObject({ type: 'Timeout', expected: { kind: 'target', target: { kind: 'turn', id: turn.turnId } } });
    expect(last.now).toBe(turn.deadline + 60_000);
    expect(second.clock.now()).toBe(turn.deadline + 60_000);
    expect(events).toMatchObject([{ kind: 'update', revision: last.revision }]);
    expect(restored.state.turn).toMatchObject({ turnId: turn.turnId, continuation: true });
  });

  it('a duplicate commandId across a restart returns the original result and writes nothing', async () => {
    const first = h.manager();
    const gameId = await seedRoom(h.db);
    const live = await first.manager.open(gameId);
    const create = sys('CreateGame', { seed: 42, rulesVersion: CURRENT_RULES_VERSION }, 0, 'create-once');
    const createResult = await ok(live, create);
    await addPlayer(live, 'a');
    await addPlayer(live, 'b');
    await startGame(live); // snapshot at 4: `create` is older than the snapshot
    const roll = { ...nextMove(live.state), commandId: 'roll-once' as CommandId };
    const rollResult = await ok(live, roll); // in the tail after the snapshot
    await first.manager.shutdown();

    const second = h.manager({ seed: 2 });
    await second.manager.restoreAll();
    const restored = second.manager.get(gameId)!;
    const events = record(restored);
    const before = await rows(gameId);

    expect(await restored.submit(create)).toEqual({ ...createResult, duplicate: true });
    expect(await restored.submit(roll)).toEqual({ ...rollResult, duplicate: true });
    expect(await restored.submit({ ...roll, payload: { changed: true } })).toMatchObject({
      kind: 'rejected',
      error: { code: 'COMMAND_ID_CONFLICT' },
    });
    expect(events).toEqual([]);
    expect(await rows(gameId)).toEqual(before);
  });

  it('snapshots at game start, every 50 accepted commands and on clean shutdown', async () => {
    const { manager, store } = h.manager();
    const gameId = await seedRoom(h.db);
    const room = await manager.open(gameId);
    await createGame(room);
    await addPlayer(room, 'a');
    await addPlayer(room, 'b');
    expect(await snapshotRevisions(h.db, gameId)).toEqual([]);
    expect(await roomStatus(h.db, gameId)).toBe('lobby');

    const started = await startGame(room);
    expect(started.revision).toBe(4);
    expect(await snapshotRevisions(h.db, gameId)).toEqual([4]);
    expect(await roomStatus(h.db, gameId)).toBe('playing');

    await playTo(room, SNAPSHOT_INTERVAL - 1);
    expect(await snapshotRevisions(h.db, gameId)).toEqual([4]);
    await step(room);
    const atFifty = room.state;
    await step(room);
    await step(room);
    expect(await snapshotRevisions(h.db, gameId)).toEqual([4, SNAPSHOT_INTERVAL]);

    await manager.shutdown();
    expect(await snapshotRevisions(h.db, gameId)).toEqual([4, SNAPSHOT_INTERVAL, SNAPSHOT_INTERVAL + 2]);
    const stored = (await rows(gameId)).snapshots;
    expect(stored[1]!.state).toEqual(atFifty);
    expect(stored[2]!.state).toEqual(room.state);

    // Writing the shutdown snapshot again is a no-op, and so is a second shutdown.
    await store.writeSnapshot(gameId, room.state);
    await manager.shutdown();
    expect(await snapshotRevisions(h.db, gameId)).toEqual([4, SNAPSHOT_INTERVAL, SNAPSHOT_INTERVAL + 2]);
  });

  it('shutdown lets an in-flight command finish and snapshots at its revision', async () => {
    const gate = gatedStore();
    const { manager } = h.manager({ wrapStore: gate.wrap });
    const gameId = await seedRoom(h.db);
    const room = await manager.open(gameId);
    await playingGame(room);
    const revision = room.state.revision;

    gate.hold();
    const inFlight = step(room);
    await gate.entered();
    let down = false;
    const shutdown = manager.shutdown().then(() => (down = true));
    const refused = await room.submit(sys('AddPlayer', { playerId: 'late' }, revision));
    expect(refused).toMatchObject({ kind: 'rejected', error: { code: 'ROOM_UNAVAILABLE' } });
    expect(down).toBe(false);

    gate.release();
    expect(await inFlight).toMatchObject({ kind: 'accepted', revision: revision + 1 });
    await shutdown;
    expect(room.status).toBe('closed');
    expect((await logEntries(h.db, gameId)).at(-1)!.revision).toBe(revision + 1);
    expect((await snapshotRevisions(h.db, gameId)).at(-1)).toBe(revision + 1);
  });

  it('after shutdown nothing runs: no Timeout, no submit, no open', async () => {
    const { manager, clock } = h.manager();
    const gameId = await seedRoom(h.db);
    const room = await manager.open(gameId);
    await playingGame(room);
    const events = record(room);
    await manager.shutdown();
    const before = await rows(gameId);
    expect(clock.pending).toEqual([]);

    clock.advance(TURN_DURATION_MS * 3);
    await whenIdle(room);
    expect(await room.submit(sys('AddPlayer', { playerId: 'late' }, room.state.revision))).toMatchObject({
      kind: 'rejected',
      error: { code: 'ROOM_UNAVAILABLE' },
    });
    await expect(manager.open(gameId)).rejects.toBeInstanceOf(RoomManagerClosedError);
    await expect(manager.restoreAll()).rejects.toBeInstanceOf(RoomManagerClosedError);
    expect(await rows(gameId)).toEqual(before);
    expect(events).toEqual([]);
    expect(room.status).toBe('closed');
  });
});
