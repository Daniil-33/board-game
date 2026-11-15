import { describe, expect, it } from 'vitest';
import { gameEngine, type GameCommand, type Revision } from '@game/game-core';
import type { Engine, RoomResult } from '../rooms/types.js';
import { logEntries, seedRoom } from './helpers/db.js';
import { lobby, ok, startGame, sys, T0, whenIdle } from './helpers/game.js';
import { record, useHarness } from './helpers/harness.js';

const h = useHarness();

// spec: server/rooms "Serial execution in arrival order", "Execute, persist, then emit" (rejected command),
// "Server-supplied context", "No rule logic in the room"
describe('room execution', () => {
  it('runs concurrent submits one at a time in arrival order, each at its arrival time', async () => {
    const { manager, clock } = h.manager();
    const gameId = await seedRoom(h.db);
    const room = await manager.open(gameId);
    await lobby(room); // revision 3
    const events = record(room);

    const resolved: string[] = [];
    const submit = (name: string, command: GameCommand): Promise<RoomResult> =>
      room.submit(command).then((result) => {
        resolved.push(name);
        return result;
      });

    // Not awaited: all four are queued before the first one touches the database.
    const first = submit('c', sys('AddPlayer', { playerId: 'c' }, 3));
    clock.advance(10);
    const second = submit('c-again', sys('AddPlayer', { playerId: 'c' }, 4));
    clock.advance(10);
    const third = submit('d', sys('AddPlayer', { playerId: 'd' }, 4));
    clock.advance(10);
    const fourth = submit('e', sys('AddPlayer', { playerId: 'e' }, 5));
    const results = await Promise.all([first, second, third, fourth]);

    expect(resolved).toEqual(['c', 'c-again', 'd', 'e']);
    expect(results.map((r) => r.kind)).toEqual(['accepted', 'rejected', 'accepted', 'accepted']);
    expect(results.map((r) => r.revision)).toEqual([4, 4, 5, 6]);
    expect(results[1]).toMatchObject({ error: { code: 'DUPLICATE_PLAYER' } });
    expect(events.map((e) => (e.kind === 'update' ? e.revision : e.kind))).toEqual([4, 5, 6]);

    const log = await logEntries(h.db, gameId);
    expect(log.map((e) => e.revision)).toEqual([1, 2, 3, 4, 5, 6]);
    // Time is the clock value when submit was called, not when the command ran.
    expect(log.slice(3).map((e) => e.now)).toEqual([T0, T0 + 20, T0 + 30]);
    const times = log.map((e) => e.now);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(room.state.players.map((p) => p.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('a rejected command carries the core code, writes nothing and notifies nobody', async () => {
    const { manager } = h.manager();
    const gameId = await seedRoom(h.db);
    const room = await manager.open(gameId);
    await lobby(room);
    const events = record(room);
    const before = room.state;

    const stale = await room.submit(sys('AddPlayer', { playerId: 'z' }, 1));
    expect(stale).toMatchObject({ kind: 'rejected', revision: 3, error: { code: 'REVISION_MISMATCH' } });
    const unknown = await room.submit(sys('Nonsense', null, 3));
    expect(unknown.kind).toBe('rejected');
    const notPlain = await room.submit(sys('AddPlayer', { playerId: 'z', when: new Date() }, 3));
    expect(notPlain).toMatchObject({ kind: 'rejected', error: { code: 'INVALID_PAYLOAD' } });

    expect(events).toEqual([]);
    expect(room.state).toBe(before);
    expect(await logEntries(h.db, gameId)).toHaveLength(3);
  });

  it('takes time and entropy from its sources: equal inputs give equal states and logs', async () => {
    const run = async () => {
      const { manager, clock } = h.manager({ seed: 7 });
      const gameId = await seedRoom(h.db);
      const room = await manager.open(gameId);
      await ok(room, sys('CreateGame', { seed: 5, rulesVersion: 'core-2' }, 0, 'd-create'));
      await ok(room, sys('AddPlayer', { playerId: 'a' }, 1, 'd-a'));
      clock.advance(250);
      await ok(room, sys('AddPlayer', { playerId: 'b' }, 2, 'd-b'));
      await ok(room, sys('StartGame', null, 3, 'd-start'));
      clock.advance(45_000); // the order-roll deadline: the room issues a Timeout
      await whenIdle(room);
      return { state: room.state, log: await logEntries(h.db, gameId) };
    };
    const one = await run();
    const two = await run();
    expect(one.log).toHaveLength(5);
    expect(one.log[4]!.command.type).toBe('Timeout');
    expect(two.state).toEqual(one.state);
    expect(two.log).toEqual(one.log);
    // The context is the room's, whatever the command object carries.
    expect(one.log[0]).toMatchObject({ now: T0 });
    expect(one.log[2]).toMatchObject({ now: T0 + 250 });
  });

  it('runs whatever engine it is given without knowing its rules', async () => {
    // Accepts `Ping` in any phase; everything else is the real engine.
    const engine: Engine = {
      execute(state, command, context) {
        if (command.type !== 'Ping') return gameEngine.execute(state, command, context);
        const revision = (state.revision + 1) as Revision;
        return {
          kind: 'accepted',
          commandId: command.commandId,
          previousRevision: state.revision,
          revision,
          state: { ...state, revision },
          events: [{ type: 'Pong', payload: { at: context.now } }],
        };
      },
    };
    const { manager } = h.manager({ engine });
    const gameId = await seedRoom(h.db);
    const room = await manager.open(gameId);
    const events = record(room);
    const result = await ok(room, { ...sys('Ping', null, 0), expected: { kind: 'revision', revision: 0 as Revision } });
    expect(result).toMatchObject({ revision: 1, events: [{ type: 'Pong', payload: { at: T0 } }] });
    expect(events).toMatchObject([{ kind: 'update', revision: 1 }]);
    expect((await logEntries(h.db, gameId)).map((e) => e.command.type)).toEqual(['Ping']);
  });

  it('an engine that throws rejects that command only; the room stays live and unchanged', async () => {
    const engine: Engine = {
      execute(state, command, context) {
        if (command.type === 'Boom') throw new Error('core bug');
        return gameEngine.execute(state, command, context);
      },
    };
    const { manager, logger } = h.manager({ engine });
    const gameId = await seedRoom(h.db);
    const room = await manager.open(gameId);
    await lobby(room);
    const events = record(room);
    const before = room.state;

    expect(await room.submit(sys('Boom', null, 3))).toMatchObject({
      kind: 'rejected',
      revision: 3,
      error: { code: 'ROOM_UNAVAILABLE' },
    });
    expect(room.status).toBe('live');
    expect(room.state).toBe(before);
    expect(events).toEqual([]);
    expect(await logEntries(h.db, gameId)).toHaveLength(3);
    expect(logger.lines.some((l) => l.level === 'error' && l.fields['gameId'] === gameId)).toBe(true);
    expect(await room.submit(sys('AddPlayer', { playerId: 'c' }, 3))).toMatchObject({ kind: 'accepted', revision: 4 });
  });

  it('notifies subscribers in revision order; unsubscribing and a throwing subscriber affect nobody else', async () => {
    const { manager, logger } = h.manager();
    const gameId = await seedRoom(h.db);
    const room = await manager.open(gameId);
    const seen: number[] = [];
    const quiet: number[] = [];
    room.subscribe(() => {
      throw new Error('subscriber bug');
    });
    room.subscribe((e) => e.kind === 'update' && seen.push(e.revision));
    const unsubscribe = room.subscribe((e) => e.kind === 'update' && quiet.push(e.revision));

    await lobby(room);
    unsubscribe();
    const started = await startGame(room);

    expect(seen).toEqual([1, 2, 3, 4]);
    expect(quiet).toEqual([1, 2, 3]);
    expect(started.duplicate).toBe(false);
    expect(room.status).toBe('live');
    expect(logger.lines.filter((l) => l.message === 'room subscriber threw')).toHaveLength(4);
  });
});
