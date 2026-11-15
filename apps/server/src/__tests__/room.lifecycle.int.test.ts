import { describe, expect, it } from 'vitest';
import type { CommandId, PlayerId, Revision } from '@game/game-core';
import type { LogEntry } from '@game/game-core';
import { createGameStore } from '../db/game-store.js';
import { roomStatus, seedRoom, snapshotRevisions } from './helpers/db.js';
import { addPlayer, lobby, ok, playingGame, startGame, sys } from './helpers/game.js';
import { record, useHarness } from './helpers/harness.js';
import type { Room } from '../rooms/types.js';

const h = useHarness();

async function members(gameId: string): Promise<string[]> {
  const rows = await h.db.selectFrom('room_members').select('guest_id').where('room_id', '=', gameId).orderBy('guest_id').execute();
  return rows.map((r) => r.guest_id);
}

async function logRevisions(gameId: string): Promise<number[]> {
  const rows = await h.db.selectFrom('game_log').select('revision').where('game_id', '=', gameId).orderBy('revision').execute();
  return rows.map((r) => r.revision);
}

const resign = (room: Room, player: string, id: string) =>
  room.submit({
    type: 'Resign',
    commandId: id as CommandId,
    actor: { kind: 'player', id: player as PlayerId },
    expected: { kind: 'revision', revision: room.state.revision as Revision },
    payload: null,
  });

// spec: server/persistence "Room status follows the log"; server/rooms "Closing a room"
describe('room status and membership follow the log', () => {
  it('Members follow the log: AddPlayer and LeaveLobby keep room_members equal to the core players', async () => {
    const gameId = await seedRoom(h.db);
    const { manager } = h.manager();
    const room = await manager.open(gameId);
    await lobby(room, ['a', 'b']);
    expect(await members(gameId)).toEqual(['a', 'b']);
    await addPlayer(room, 'c');
    expect(await members(gameId)).toEqual(['a', 'b', 'c']);
    await ok(room, sys('LeaveLobby', { playerId: 'b' }, room.state.revision));
    expect(await members(gameId)).toEqual(['a', 'c']);
    expect(await roomStatus(h.db, gameId)).toBe('lobby');
  });

  it('a failed insert changes no member row (one transaction)', async () => {
    const gameId = await seedRoom(h.db);
    const { manager } = h.manager();
    const room = await manager.open(gameId);
    await lobby(room, ['a', 'b']);
    const before = await logRevisions(gameId);
    // The member delete of 'b' runs, then the insert of an unknown guest fails
    // the foreign key: the whole transaction, log row included, rolls back.
    const entry = { revision: room.state.revision + 1, command: { commandId: 'ghost-write' } } as unknown as LogEntry;
    await expect(
      createGameStore(h.db).appendEntry(gameId, entry, { status: 'closed', members: ['a', 'ghost'], snapshot: null }),
    ).rejects.toMatchObject({ code: '23503' });
    expect(await members(gameId)).toEqual(['a', 'b']);
    expect(await logRevisions(gameId)).toEqual(before);
    expect(await roomStatus(h.db, gameId)).toBe('lobby');
  });

  it('Game finished: the Resign that leaves one player sets finished and snapshots that revision', async () => {
    const gameId = await seedRoom(h.db);
    const { manager } = h.manager();
    const room = await manager.open(gameId);
    await playingGame(room, ['a', 'b']);
    expect(await roomStatus(h.db, gameId)).toBe('playing');
    const result = await resign(room, 'b', 'resign-b');
    expect(result).toMatchObject({ kind: 'accepted', duplicate: false });
    expect(room.state.phase).toBe('finished');
    expect(room.state.winner).toBe('a');
    expect(await roomStatus(h.db, gameId)).toBe('finished');
    expect(await snapshotRevisions(h.db, gameId)).toContain(room.state.revision);
    // Eliminated players stay members (they may watch the result).
    expect(await members(gameId)).toEqual(['a', 'b']);
  });

  it('a finished room reloads on demand with its winner', async () => {
    const gameId = await seedRoom(h.db);
    const first = h.manager();
    const room = await first.manager.open(gameId);
    await playingGame(room, ['a', 'b']);
    await resign(room, 'a', 'resign-a');
    await first.manager.shutdown();

    const second = h.manager();
    expect((await second.manager.restoreAll()).restored).not.toContain(gameId);
    const again = await second.manager.open(gameId);
    expect(again.state.phase).toBe('finished');
    expect(again.state.winner).toBe('b');
  });

  it('Close on accept: update then closed, status closed, later submits ROOM_UNAVAILABLE', async () => {
    const gameId = await seedRoom(h.db);
    const { manager } = h.manager();
    const room = await manager.open(gameId);
    await lobby(room, ['a', 'b']);
    const events = record(room);
    const result = await room.submit(sys('LeaveLobby', { playerId: 'a' }, room.state.revision), { closeRoom: true });
    expect(result).toMatchObject({ kind: 'accepted' });
    expect(events.map((e) => e.kind)).toEqual(['update', 'closed']);
    expect(await roomStatus(h.db, gameId)).toBe('closed');
    expect(await members(gameId)).toEqual(['b']);
    expect(room.status).toBe('closed');
    expect(await room.submit(sys('AddPlayer', { playerId: 'c' }, room.state.revision))).toMatchObject({
      kind: 'rejected',
      error: { code: 'ROOM_UNAVAILABLE' },
    });
    // Shutdown of a closed room writes no snapshot and does not throw.
    await manager.shutdown();
  });

  it('Close on reject: a rejected or duplicate command leaves the room live', async () => {
    const gameId = await seedRoom(h.db);
    const { manager } = h.manager();
    const room = await manager.open(gameId);
    await lobby(room, ['a', 'b']);
    const leave = sys('LeaveLobby', { playerId: 'b' }, room.state.revision, 'leave-b');
    await ok(room, leave);
    const events = record(room);

    const rejected = await room.submit(sys('LeaveLobby', { playerId: 'zz' }, room.state.revision), { closeRoom: true });
    expect(rejected).toMatchObject({ kind: 'rejected', error: { code: 'PLAYER_NOT_FOUND' } });
    const duplicate = await room.submit(leave, { closeRoom: true });
    expect(duplicate).toMatchObject({ kind: 'accepted', duplicate: true });

    expect(events).toEqual([]);
    expect(room.status).toBe('live');
    expect(await roomStatus(h.db, gameId)).toBe('lobby');
    await addPlayer(room, 'c');
  });

  it('Game started: status playing only after the StartGame entry is written', async () => {
    const gameId = await seedRoom(h.db);
    const { manager } = h.manager();
    const room = await manager.open(gameId);
    await lobby(room, ['a', 'b']);
    await startGame(room);
    expect(await roomStatus(h.db, gameId)).toBe('playing');
  });
});
