import { describe, expect, it } from 'vitest';
import type { RoomEvent } from '../rooms/types.js';
import { logEntries, seedRoom } from './helpers/db.js';
import { addPlayer, lobby, sys } from './helpers/game.js';
import { gatedStore, useHarness } from './helpers/harness.js';

const h = useHarness();

// spec: server/rooms "Execute, persist, then emit"
describe('write order', () => {
  it('nobody observes an accepted command before its insert has committed', async () => {
    const gate = gatedStore();
    const { manager } = h.manager({ wrapStore: gate.wrap });
    const gameId = await seedRoom(h.db);
    const room = await manager.open(gameId);
    await lobby(room); // revision 3
    const before = room.state;

    const notified: RoomEvent[] = [];
    const rowsSeenByListener: Promise<number[]>[] = [];
    room.subscribe((event) => {
      notified.push(event);
      // Asked inside the notification: is my revision in the log already?
      rowsSeenByListener.push(logEntries(h.db, gameId).then((log) => log.map((e) => e.revision)));
    });

    gate.hold();
    let settled = false;
    const pending = room.submit(sys('AddPlayer', { playerId: 'c' }, 3)).then((result) => {
      settled = true;
      return result;
    });
    await gate.entered(); // the core has accepted; the insert has not started

    expect(notified).toEqual([]);
    expect(settled).toBe(false);
    expect(room.state).toBe(before);
    expect(room.state.revision).toBe(3);
    expect(await logEntries(h.db, gameId)).toHaveLength(3);

    gate.release();
    const result = await pending;
    expect(result).toMatchObject({ kind: 'accepted', revision: 4, duplicate: false });
    expect(notified).toMatchObject([{ kind: 'update', revision: 4 }]);
    expect(await rowsSeenByListener[0]).toContain(4);
    expect(room.state.revision).toBe(4);
    expect(notified[0]).toMatchObject({ state: room.state });
  });

  it('a command queued behind a slow write waits for it and sees its state', async () => {
    const gate = gatedStore();
    const { manager } = h.manager({ wrapStore: gate.wrap });
    const gameId = await seedRoom(h.db);
    const room = await manager.open(gameId);
    await lobby(room);

    gate.hold();
    const slow = room.submit(sys('AddPlayer', { playerId: 'c' }, 3));
    const queued = room.submit(sys('AddPlayer', { playerId: 'd' }, 4));
    await gate.entered();
    expect(room.state.revision).toBe(3);
    gate.release();

    expect(await slow).toMatchObject({ kind: 'accepted', revision: 4 });
    expect(await queued).toMatchObject({ kind: 'accepted', revision: 5 });
    await addPlayer(room, 'e');
    expect((await logEntries(h.db, gameId)).map((e) => e.revision)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
