import { describe, expect, it } from 'vitest';
import type { Revision } from '@game/game-core';
import { SNAPSHOT_INTERVAL } from '../rooms/room.js';
import { logEntries, seedRoom, snapshotRevisions } from './helpers/db.js';
import { lobby, ok, playTo, startGame, sys } from './helpers/game.js';
import { record, useHarness } from './helpers/harness.js';

const h = useHarness();

// spec: server/rooms "Duplicate delivery"
describe('duplicate delivery', () => {
  it('the same command again returns the original result and writes nothing', async () => {
    const { manager } = h.manager();
    const gameId = await seedRoom(h.db);
    const room = await manager.open(gameId);
    await lobby(room);
    const command = sys('AddPlayer', { playerId: 'c' }, 3, 'join-c');
    const original = await ok(room, command);
    await ok(room, sys('AddPlayer', { playerId: 'd' }, 4));
    const events = record(room);
    const before = room.state;

    // Same body with different key order, as a re-encoded retry would have.
    const retry = { payload: { playerId: 'c' }, expected: { revision: 3 as Revision, kind: 'revision' as const }, actor: command.actor, commandId: command.commandId, type: 'AddPlayer' };
    const again = await room.submit(retry);

    expect(again).toEqual({ ...original, duplicate: true });
    expect(again.revision).toBe(4); // the original revision, not the current one (5)
    expect(events).toEqual([]);
    expect(room.state).toBe(before);
    expect(await logEntries(h.db, gameId)).toHaveLength(5);
  });

  it('a logged command id with a different body is rejected with COMMAND_ID_CONFLICT', async () => {
    const { manager } = h.manager();
    const gameId = await seedRoom(h.db);
    const room = await manager.open(gameId);
    await lobby(room);
    await ok(room, sys('AddPlayer', { playerId: 'c' }, 3, 'join-c'));

    const otherPayload = await room.submit(sys('AddPlayer', { playerId: 'x' }, 3, 'join-c'));
    const otherExpectation = await room.submit(sys('AddPlayer', { playerId: 'c' }, 4, 'join-c'));
    const otherType = await room.submit(sys('StartGame', null, 4, 'join-c'));
    for (const result of [otherPayload, otherExpectation, otherType]) {
      expect(result).toMatchObject({ kind: 'rejected', revision: 4, error: { code: 'COMMAND_ID_CONFLICT' } });
    }
    expect(await logEntries(h.db, gameId)).toHaveLength(4);
    expect(room.state.phase).toBe('lobby');
  });

  it('holds for a command logged before the latest snapshot', async () => {
    const { manager } = h.manager();
    const gameId = await seedRoom(h.db);
    const room = await manager.open(gameId);
    const create = sys('CreateGame', { seed: 42, rulesVersion: 'core-2' }, 0, 'create-once');
    const original = await ok(room, create);
    await ok(room, sys('AddPlayer', { playerId: 'a' }, 1));
    await ok(room, sys('AddPlayer', { playerId: 'b' }, 2));
    await startGame(room);
    await playTo(room, SNAPSHOT_INTERVAL + 2);
    expect(await snapshotRevisions(h.db, gameId)).toEqual([4, SNAPSHOT_INTERVAL]);

    const count = (await logEntries(h.db, gameId)).length;
    expect(await room.submit(create)).toEqual({ ...original, duplicate: true });
    expect(await logEntries(h.db, gameId)).toHaveLength(count);
  });

  it('a rejected command leaves its id free', async () => {
    const { manager } = h.manager();
    const gameId = await seedRoom(h.db);
    const room = await manager.open(gameId);
    await lobby(room);
    expect(await room.submit(sys('AddPlayer', { playerId: 'c' }, 1, 'retry-me'))).toMatchObject({ kind: 'rejected' });
    expect(await room.submit(sys('AddPlayer', { playerId: 'c' }, 3, 'retry-me'))).toMatchObject({ kind: 'accepted', duplicate: false });
  });
});
