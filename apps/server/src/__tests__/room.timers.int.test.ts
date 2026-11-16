import { describe, expect, it } from 'vitest';
import { AUCTION_RESPONSE_MS, CONTINUATION_MS, SETUP_ROLL_DURATION_MS, TURN_DURATION_MS, pendingDeadlines, type CommandId } from '@game/game-core';
import { RETRY_FLOOR_MS } from '../rooms/room.js';
import { logEntries, seedRoom } from './helpers/db.js';
import { lobby, nextMove, playingGame, startGame, step, T0, timeoutFor, whenIdle } from './helpers/game.js';
import { record, useHarness } from './helpers/harness.js';

const h = useHarness();

const timeouts = async (gameId: string) => (await logEntries(h.db, gameId)).filter((e) => e.command.type === 'Timeout');

// spec: server/timers
describe('deadline timers', () => {
  it('arms nothing in the lobby and one timer per pending deadline afterwards', async () => {
    const { manager, clock } = h.manager();
    const gameId = await seedRoom(h.db);
    const room = await manager.open(gameId);
    expect(clock.pending).toEqual([]);
    await lobby(room, ['a', 'b'], 8); // Inert landing keeps this test about turn timer replacement.
    expect(clock.pending).toEqual([]);

    await startGame(room);
    expect(clock.pending).toEqual([T0 + SETUP_ROLL_DURATION_MS]);

    // Every transition replaces the timer by the one for the new deadline.
    clock.advance(1000);
    while (room.state.phase === 'setup') {
      await step(room);
      expect(clock.pending).toEqual(pendingDeadlines(room.state).map((d) => d.at));
      expect(clock.pending).toHaveLength(1);
    }
    const firstTurn = room.state.turn!;
    expect(clock.pending).toEqual([T0 + 1000 + TURN_DURATION_MS]);

    clock.advance(500);
    await step(room); // RollDice: same turn, same deadline
    await step(room); // EndTurn: next turn
    expect(room.state.turn!.turnId).not.toBe(firstTurn.turnId);
    expect(clock.pending).toEqual([T0 + 1500 + TURN_DURATION_MS]);
  });

  it('submits a system Timeout when the deadline is reached, not a millisecond earlier', async () => {
    const { manager, clock } = h.manager();
    const gameId = await seedRoom(h.db);
    const room = await manager.open(gameId);
    await lobby(room);
    await startGame(room);
    const events = record(room);
    const [deadline] = pendingDeadlines(room.state);

    clock.advance(SETUP_ROLL_DURATION_MS - 1);
    await whenIdle(room);
    expect(await timeouts(gameId)).toEqual([]);
    expect(events).toEqual([]);

    clock.advance(1);
    await whenIdle(room);
    const [entry, ...rest] = await timeouts(gameId);
    expect(rest).toEqual([]);
    expect(entry!.command).toMatchObject({
      type: 'Timeout',
      actor: { kind: 'system' },
      expected: { kind: 'target', target: deadline!.target },
      payload: null,
    });
    expect(entry!.command.commandId).toMatch(/^timeout-[0-9a-f]{32}$/);
    expect(entry!.now).toBeGreaterThanOrEqual(deadline!.at);
    expect(events).toMatchObject([{ kind: 'update', revision: entry!.revision, commandId: entry!.command.commandId }]);
    // The next pending deadline has its timer.
    expect(clock.pending).toEqual(pendingDeadlines(room.state).map((d) => d.at));
    expect(clock.pending).toHaveLength(1);
  });

  it('times out the same turn twice: automatic roll, then the continuation deadline', async () => {
    const { manager, clock } = h.manager();
    const gameId = await seedRoom(h.db);
    const room = await manager.open(gameId);
    await playingGame(room, ['a', 'b'], 8); // Both turn timeouts stay free of acquisition.
    const turn = room.state.turn!;
    expect(turn.rolled).toBe(false);

    clock.advance(TURN_DURATION_MS);
    await whenIdle(room);
    expect(room.state.turn).toMatchObject({ turnId: turn.turnId, rolled: true, continuation: true });
    expect(clock.pending).toEqual([T0 + TURN_DURATION_MS + CONTINUATION_MS]);

    clock.advance(CONTINUATION_MS);
    await whenIdle(room);
    expect(room.state.turn!.turnId).not.toBe(turn.turnId);

    const log = await timeouts(gameId);
    expect(log.map((e) => e.command.expected)).toEqual([
      { kind: 'target', target: { kind: 'turn', id: turn.turnId } },
      { kind: 'target', target: { kind: 'turn', id: turn.turnId } },
    ]);
    expect(log[0]!.command.commandId).not.toBe(log[1]!.command.commandId);
    expect(log.map((e) => e.now)).toEqual([T0 + TURN_DURATION_MS, T0 + TURN_DURATION_MS + CONTINUATION_MS]);
  });

  it('replaces the paused turn timer with response timers and closes only after automatic passes', async () => {
    const { manager, clock } = h.manager();
    const gameId = await seedRoom(h.db);
    const room = await manager.open(gameId);
    await playingGame(room); // seed42: automatic roll lands on a free asset
    const turnId = room.state.turn!.turnId;
    clock.advance(TURN_DURATION_MS);
    await whenIdle(room);
    expect(room.state.purchase).not.toBeNull();
    clock.advance(CONTINUATION_MS);
    await whenIdle(room);
    const auction = room.state.auction!;
    expect(auction).not.toBeNull();
    expect(room.state.turn).toMatchObject({ turnId, pausedRemainingMs: 0 });
    const responseIds: string[] = [];
    while (room.state.auction) {
      const response = room.state.auction;
      responseIds.push(response.responseId);
      expect(clock.pending).toEqual([clock.now() + AUCTION_RESPONSE_MS]);
      expect(pendingDeadlines(room.state)[0]!.target.kind).toBe('auctionResponse');
      const revision = room.state.revision;
      clock.advance(AUCTION_RESPONSE_MS - 1);
      await whenIdle(room);
      expect(room.state.revision).toBe(revision);
      clock.advance(1);
      await whenIdle(room);
      expect(room.state.revision).toBe(revision + 1);
    }
    expect(new Set(responseIds).size).toBe(room.state.players.length);
    const log = await timeouts(gameId);
    expect(log).toHaveLength(2 + responseIds.length);
    expect(log.slice(2).map(e => e.command.expected)).toEqual(responseIds.map(id => ({ kind: 'target', target: { kind: 'auctionResponse', id } })));
    expect(log.slice(2).flatMap(e => e.events).filter(e => e.type === 'AuctionPassed')).toHaveLength(responseIds.length);
    for (const e of log.slice(2)) expect(e.events[0]).toMatchObject({ type: 'AuctionPassed', payload: { auto: true } });
    expect(log.at(-1)!.events.map(e => e.type)).toEqual(['AuctionPassed','AuctionEndedUnsold','TurnEnded','TurnStarted']);
    expect(room.state.turn!.turnId).not.toBe(turnId);
    expect(clock.pending).toEqual([clock.now() + TURN_DURATION_MS]);
  });

  it('keeps a game moving with no player at all', async () => {
    const { manager, clock } = h.manager();
    const gameId = await seedRoom(h.db);
    const room = await manager.open(gameId);
    await lobby(room, ['a', 'b', 'c']);
    await startGame(room);
    for (let i = 0; i < 12; i++) {
      const [next] = clock.pending;
      clock.advance(next! - clock.now());
      await whenIdle(room);
    }
    expect(room.state.phase).toBe('playing');
    expect(await timeouts(gameId)).toHaveLength(12);
    expect(room.state.revision).toBe(5 + 12);
  });

  it('a stale Timeout is rejected by the core and changes nothing', async () => {
    const { manager, clock } = h.manager();
    const gameId = await seedRoom(h.db);
    const room = await manager.open(gameId);
    await playingGame(room);
    const stale = { kind: 'turn', id: room.state.turn!.turnId };
    await step(room); // RollDice
    await step(room); // EndTurn: the old turn is gone
    const events = record(room);
    const before = { state: room.state, log: await logEntries(h.db, gameId), timers: clock.pending };

    const result = await room.submit(timeoutFor(stale));

    expect(result).toMatchObject({ kind: 'rejected', error: { code: 'TARGET_MISMATCH' } });
    expect(room.state).toBe(before.state);
    expect(await logEntries(h.db, gameId)).toEqual(before.log);
    expect(clock.pending).toEqual(before.timers);
    expect(events).toEqual([]);
  });

  it('a timer that fires before its deadline is re-armed instead of submitting', async () => {
    const { manager, clock } = h.manager();
    const gameId = await seedRoom(h.db);
    const room = await manager.open(gameId);
    await lobby(room);
    await startGame(room);
    const armed = clock.pending;

    clock.advance(10);
    clock.fireEarly();
    await whenIdle(room);
    expect(await timeouts(gameId)).toEqual([]);
    expect(clock.pending).toEqual(armed);

    clock.advance(SETUP_ROLL_DURATION_MS - 10);
    await whenIdle(room);
    expect(await timeouts(gameId)).toHaveLength(1);
  });

  it('retries a Timeout whose insert failed, no sooner than the retry floor', async () => {
    let failTimeouts = true;
    const { manager, clock } = h.manager({
      wrapStore: (store) => ({
        ...store,
        async appendEntry(gameId, entry, options) {
          if (failTimeouts && entry.command.type === 'Timeout') throw new Error('write refused');
          return store.appendEntry(gameId, entry, options);
        },
      }),
    });
    const gameId = await seedRoom(h.db);
    const room = await manager.open(gameId);
    await lobby(room);
    await startGame(room);
    const events = record(room);

    clock.advance(SETUP_ROLL_DURATION_MS);
    await whenIdle(room);
    expect(await timeouts(gameId)).toEqual([]);
    expect(events).toEqual([]);
    expect(room.status).toBe('live');
    expect(clock.pending).toEqual([T0 + SETUP_ROLL_DURATION_MS + RETRY_FLOOR_MS]);

    // Still failing: one attempt per floor, not a hot loop.
    clock.advance(RETRY_FLOOR_MS);
    await whenIdle(room);
    expect(clock.pending).toEqual([T0 + SETUP_ROLL_DURATION_MS + 2 * RETRY_FLOOR_MS]);

    failTimeouts = false;
    clock.advance(RETRY_FLOOR_MS - 1);
    await whenIdle(room);
    expect(await timeouts(gameId)).toEqual([]);
    clock.advance(1);
    await whenIdle(room);
    expect(await timeouts(gameId)).toHaveLength(1);
    expect(events).toMatchObject([{ kind: 'update' }]);
  });

  // Review RVW-001: only a failed Timeout may hold its own deadline back.
  it('a failing player command never delays a deadline', async () => {
    let failWrites = false;
    const { manager, clock } = h.manager({
      wrapStore: (store) => ({
        ...store,
        async appendEntry(gameId, entry, options) {
          if (failWrites && entry.command.type !== 'Timeout') throw new Error('write refused');
          return store.appendEntry(gameId, entry, options);
        },
      }),
    });
    const gameId = await seedRoom(h.db);
    const room = await manager.open(gameId);
    await playingGame(room);
    const deadline = room.state.turn!.deadline;
    expect(clock.pending).toEqual([deadline]);

    clock.advance(TURN_DURATION_MS - 5);
    // A command id Postgres cannot store: the log lookup itself fails (SQLSTATE 22021).
    for (let i = 0; i < 3; i++) {
      const unstorable = await room.submit({ ...nextMove(room.state), commandId: `bad\u0000${i}` as CommandId });
      expect(unstorable).toMatchObject({ kind: 'rejected', error: { code: 'PERSISTENCE_FAILED' } });
      expect(clock.pending).toEqual([deadline]);
    }
    // A command the core accepts but that cannot be written: reload, same deadline.
    failWrites = true;
    for (let i = 0; i < 3; i++) {
      expect(await room.submit(nextMove(room.state))).toMatchObject({ kind: 'rejected', error: { code: 'PERSISTENCE_FAILED' } });
      expect(clock.pending).toEqual([deadline]);
    }
    expect(room.status).toBe('live');

    clock.advance(5);
    await whenIdle(room);
    const [timeout, ...rest] = await timeouts(gameId);
    expect(rest).toEqual([]);
    expect(timeout!.now).toBe(deadline);
  });

  it('retries a Timeout whose command id lookup failed', async () => {
    let broken = false;
    const { manager, clock } = h.manager({
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
    await startGame(room);

    broken = true;
    clock.advance(SETUP_ROLL_DURATION_MS);
    await whenIdle(room);
    expect(clock.pending).toEqual([T0 + SETUP_ROLL_DURATION_MS + RETRY_FLOOR_MS]);
    broken = false;
    clock.advance(RETRY_FLOOR_MS);
    await whenIdle(room);
    expect(await timeouts(gameId)).toHaveLength(1);
  });
});
