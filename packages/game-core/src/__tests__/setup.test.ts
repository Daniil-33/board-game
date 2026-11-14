import { describe, it, expect } from 'vitest';
import { cmd, player } from './helpers/fixtures.js';
import { setupGame, types, T0 } from './helpers/game.js';
import { SETUP_ROLL_DURATION_MS } from '../deadlines.js';

// spec: engine/turn-order
describe('order rolls: sequential', () => {
  it('StartGame makes the first player in join order the current roller', () => {
    const g = setupGame(['a', 'b', 'c']);
    const setup = g.state.setup!;
    expect(setup.playerId).toBe('a');
    expect(setup.deadline).toBe(T0 + SETUP_ROLL_DURATION_MS);
    const started = g.session.log.at(-1)!.events.at(-1)!;
    expect(started).toEqual({
      type: 'OrderRollStarted',
      payload: { setupRollId: setup.setupRollId, playerId: 'a', deadline: T0 + SETUP_ROLL_DURATION_MS },
    });
  });

  it('an out-of-turn order roll is NOT_ACTIVE_PLAYER and leaves the state unchanged', () => {
    const g = setupGame(['a', 'b', 'c']);
    const before = g.state;
    const r = g.submit(g.rollForOrderCmd('b'));
    expect(r.kind).toBe('rejected');
    if (r.kind === 'rejected') expect(r.error.code).toBe('NOT_ACTIVE_PLAYER');
    expect(g.state).toBe(before);
  });

  it('a non-null payload is INVALID_PAYLOAD', () => {
    const g = setupGame(['a', 'b']);
    const c = cmd('RollForOrder', { value: 6 }, { actor: player('a'), target: { kind: 'setupRoll', id: g.state.setup!.setupRollId } });
    const r = g.submit(c);
    expect(r.kind === 'rejected' && r.error.code).toBe('INVALID_PAYLOAD');
  });

  it('a stale setupRoll target is TARGET_MISMATCH', () => {
    const g = setupGame(['a', 'b', 'c']);
    const stale = g.rollForOrderCmd('b');
    g.rollForOrder(4);
    // b is now current, but names a's finished roll.
    const r = g.submit({ ...stale, commandId: 'stale-1' as never });
    expect(r.kind === 'rejected' && r.error.code).toBe('TARGET_MISMATCH');
  });

  it('RollDice in setup is rejected without changing the state', () => {
    const g = setupGame(['a', 'b']);
    const before = g.state;
    const r = g.submit(cmd('RollDice', null, { actor: player('a'), target: { kind: 'turn', id: 't1' } }));
    expect(r.kind).toBe('rejected');
    expect(g.state).toBe(before);
  });
});

describe('one die per order roll', () => {
  it('records the roll and passes to the next roller under a new target', () => {
    const g = setupGame(['a', 'b', 'c']);
    const first = g.state.setup!.setupRollId;
    const events = g.rollForOrder(4);
    expect(events[0]).toEqual({ type: 'OrderDieRolled', payload: { playerId: 'a', value: 4, auto: false } });
    expect(types(events)).toEqual(['OrderDieRolled', 'OrderRollStarted']);
    expect(g.state.setup!.playerId).toBe('b');
    expect(g.state.setup!.setupRollId).not.toBe(first);
    expect(g.state.setup!.round.rolls).toEqual({ a: 4 });
  });
});

describe('descending order with tie groups', () => {
  it('tie among two of three: only the tied reroll, in join order; the other keeps its place', () => {
    const g = setupGame(['a', 'b', 'c']);
    g.rollForOrder(5);
    g.rollForOrder(2);
    const events = g.rollForOrder(5);
    expect(types(events)).toEqual(['OrderDieRolled', 'OrderTied', 'OrderRollStarted']);
    expect(events[1]!.payload).toEqual({ playerIds: ['a', 'c'], value: 5 });
    expect(g.state.setup!.playerId).toBe('a');
    g.rollForOrder(3);
    expect(g.state.setup!.playerId).toBe('c');
    const last = g.rollForOrder(6);
    expect(last.find((e) => e.type === 'TurnOrderDetermined')!.payload).toEqual({ order: ['c', 'a', 'b'] });
  });

  it('first unresolved group rerolls first', () => {
    const g = setupGame(['a', 'b', 'c', 'd']);
    g.rollForOrder(6);
    g.rollForOrder(6);
    g.rollForOrder(3);
    const events = g.rollForOrder(3);
    expect(events.filter((e) => e.type === 'OrderTied').map((e) => e.payload)).toEqual([
      { playerIds: ['a', 'b'], value: 6 },
      { playerIds: ['c', 'd'], value: 3 },
    ]);
    const rollers: string[] = [];
    for (const v of [1, 2, 4, 5]) {
      rollers.push(g.state.setup!.playerId);
      g.rollForOrder(v);
    }
    expect(rollers).toEqual(['a', 'b', 'c', 'd']);
    expect(g.state.order).toEqual(['b', 'a', 'd', 'c']);
  });

  it('a repeated tie emits another OrderTied and rerolls again', () => {
    const g = setupGame(['a', 'b']);
    g.rollForOrder(4);
    expect(types(g.rollForOrder(4))).toContain('OrderTied');
    g.rollForOrder(2);
    const again = g.rollForOrder(2);
    expect(again.find((e) => e.type === 'OrderTied')!.payload).toEqual({ playerIds: ['a', 'b'], value: 2 });
    expect(g.state.phase).toBe('setup');
    expect(g.state.setup!.playerId).toBe('a');
    g.rollForOrder(1);
    g.rollForOrder(6);
    expect(g.state.order).toEqual(['b', 'a']);
  });

  it('setupRoll ids are never reused', () => {
    const g = setupGame(['a', 'b', 'c']);
    const ids = new Set<string>([g.state.setup!.setupRollId]);
    for (const v of [3, 3, 3, 2, 2, 2, 1, 5, 4]) {
      g.rollForOrder(v);
      if (g.state.setup) {
        expect(ids.has(g.state.setup.setupRollId)).toBe(false);
        ids.add(g.state.setup.setupRollId);
      }
    }
    expect(g.state.phase).toBe('playing');
  });
});

describe('order fixed and play begins', () => {
  it('two players, no tie', () => {
    const g = setupGame(['a', 'b']);
    g.rollForOrder(2);
    const events = g.rollForOrder(5);
    expect(types(events)).toEqual(['OrderDieRolled', 'TurnOrderDetermined', 'TurnStarted']);
    expect(events[1]!.payload).toEqual({ order: ['b', 'a'] });
    expect(events[2]!.payload).toMatchObject({ playerId: 'b', bonus: false });
    expect(g.state.phase).toBe('playing');
    expect(g.state.setup).toBeNull();
    expect(g.state.positions).toEqual({ a: 0, b: 0 });
    expect(g.state.turn!.playerId).toBe('b');
  });
});

describe('order roll deadline', () => {
  it('Timeout at the deadline rolls for the current roller with auto: true', () => {
    const g = setupGame(['a', 'b', 'c']);
    const deadline = g.state.setup!.deadline;
    const events = g.timeout({ at: deadline, dice: [3] });
    expect(events[0]).toEqual({ type: 'OrderDieRolled', payload: { playerId: 'a', value: 3, auto: true } });
    expect(g.state.setup!.playerId).toBe('b');
    expect(g.state.setup!.deadline).toBe(deadline + SETUP_ROLL_DURATION_MS);
  });

  it('a Timeout finishing the order roll starts play', () => {
    const g = setupGame(['a', 'b']);
    g.rollForOrder(2);
    const events = g.timeout({ dice: [6] });
    expect(types(events)).toEqual(['OrderDieRolled', 'TurnOrderDetermined', 'TurnStarted']);
    expect(g.state.order).toEqual(['b', 'a']);
  });
});
