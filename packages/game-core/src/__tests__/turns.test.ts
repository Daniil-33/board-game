import { describe, it, expect } from 'vitest';
import { cmd, player } from './helpers/fixtures.js';
import { playingGame, types } from './helpers/game.js';
import { TURN_DURATION_MS } from '../deadlines.js';
import { TURN_QUOTAS } from '../turns.js';

// spec: engine/turn-cycle
describe('current turn', () => {
  it('the first turn belongs to the first in order, with a 45 s deadline', () => {
    const g = playingGame(['a', 'b']);
    const turn = g.state.turn!;
    expect(turn.playerId).toBe('a');
    expect(turn.deadline).toBe(g.now + TURN_DURATION_MS);
    expect(turn.quotas).toEqual({ builds: 1, offers: 2 });
    expect(turn).toMatchObject({ rolled: false, bonus: false, continuation: false, doublesStreak: 0, pendingBonus: false });
  });

  it('turn ids are never reused over 200 turns', () => {
    const g = playingGame(['a', 'b', 'c']);
    const ids = new Set<string>([g.state.turn!.turnId]);
    let started = 1;
    for (let i = 0; started < 200; i++) {
      // Mix manual rolls, timeouts and doubles.
      const d1 = 1 + (i % 6);
      const d2 = 1 + ((i * 5 + 1) % 6);
      g.now += 1_000;
      const events = i % 4 === 0 ? g.timeout({ dice: [d1, d2] }) : g.roll(d1, d2);
      g.now += 1_000;
      const closing = g.state.turn!.rolled ? (i % 3 === 0 ? g.timeout() : g.endTurn()) : [];
      const settlement = [];
      while (g.state.auction !== null) settlement.push(...g.timeout());
      for (const e of [...events, ...closing, ...settlement]) {
        if (e.type === 'TurnStarted') {
          const id = (e.payload as { turnId: string }).turnId;
          expect(ids.has(id)).toBe(false);
          ids.add(id);
          started += 1;
        }
      }
    }
    expect(ids.size).toBeGreaterThanOrEqual(200);
  });
});

describe('only the turn owner acts', () => {
  it.each(['RollDice', 'EndTurn'])('%s by another member is NOT_ACTIVE_PLAYER with the state unchanged', (type) => {
    const g = playingGame(['a', 'b']);
    if (type === 'EndTurn') g.roll(1, 2);
    const before = g.state;
    const r = g.submit(cmd(type, null, { actor: player('b'), target: { kind: 'turn', id: before.turn!.turnId } }));
    expect(r.kind === 'rejected' && r.error.code).toBe('NOT_ACTIVE_PLAYER');
    expect(g.state).toBe(before);
  });

  it.each(['RollDice', 'EndTurn'])('%s with a non-null payload is INVALID_PAYLOAD', (type) => {
    const g = playingGame(['a', 'b']);
    const r = g.submit(cmd(type, { x: 1 }, { actor: player('a'), target: { kind: 'turn', id: g.state.turn!.turnId } }));
    expect(r.kind === 'rejected' && r.error.code).toBe('INVALID_PAYLOAD');
  });

  it('the system actor may not roll', () => {
    const g = playingGame(['a', 'b']);
    const r = g.submit(cmd('RollDice', null, { target: { kind: 'turn', id: g.state.turn!.turnId } }));
    expect(r.kind === 'rejected' && r.error.code).toBe('ACTOR_NOT_ALLOWED');
  });
});

describe('roll the dice once per turn', () => {
  it('emits DiceRolled and PlayerMoved and marks the turn rolled', () => {
    const g = playingGame(['a', 'b']);
    const turnId = g.state.turn!.turnId;
    const events = g.roll(2, 5);
    expect(events).toEqual([
      { type: 'DiceRolled', payload: { turnId, playerId: 'a', dice: [2, 5], double: false, auto: false } },
      { type: 'PlayerMoved', payload: { playerId: 'a', from: 0, to: 7, steps: 7 } },
      { type: 'ChanceDrawn', payload: { playerId:'a',card:'loss-10',amount:2990 } },
      { type: 'ChargeDue', payload: { payerId:'a',amount:2990,cause:'chance' } },
    ]);
    expect(g.state.turn!.rolled).toBe(true);
    expect(g.state.positions).toEqual({ a: 7, b: 0 });
  });

  it('a second roll is ALREADY_ROLLED', () => {
    const g = playingGame(['a', 'b']);
    g.roll(2, 5);
    const r = g.submit(g.rollDiceCmd());
    expect(r.kind === 'rejected' && r.error.code).toBe('ALREADY_ROLLED');
  });

  it('a rejected roll consumes no randomness', () => {
    const g = playingGame(['a', 'b']);
    const before = g.state;
    g.submit(cmd('RollDice', null, { actor: player('b'), target: { kind: 'turn', id: before.turn!.turnId } }));
    expect(g.state.rng).toBe(before.rng);
  });
});

describe('movement on the CLASSIC_40', () => {
  it('wraps around: from 36 by 3 + 4 to 3', () => {
    const g = playingGame(['a', 'b']);
    for (const [d1, d2] of [
      [6, 5],
      [6, 5],
      [6, 5],
      [1, 2],
    ] as const) {
      g.roll(d1, d2);
      g.endTurn();
      g.roll(1, 2);
      g.endTurn();
    }
    expect(g.state.positions['a']).toBe(36);
    const events = g.roll(3, 4);
    expect(events[1]).toEqual({ type: 'PlayerMoved', payload: { playerId: 'a', from: 36, to: 3, steps: 7 } });
    expect(g.state.positions['a']).toBe(3);
  });
});

describe('ending a turn', () => {
  it('EndTurn passes play to the next player', () => {
    const g = playingGame(['a', 'b']);
    const turnId = g.state.turn!.turnId;
    g.roll(1, 3);
    g.now += 5_000;
    const events = g.endTurn();
    expect(types(events)).toEqual(['BalanceChanged','ChargePaid','TurnEnded','TurnStarted']);
    expect(events[0]!.payload).toEqual({playerId:'a',delta:-1490,balance:28420,reason:'chance'});
    expect(events[1]!.payload).toEqual({payerId:'a',amount:1490,auto:true});
    expect(events[2]!.payload).toEqual({ turnId, playerId: 'a', reason: 'end-turn' });
    expect(events[3]!.payload).toMatchObject({ playerId: 'b', bonus: false, deadline: g.now + TURN_DURATION_MS });
  });

  it('order wraps around after the last player', () => {
    const g = playingGame(['a', 'b', 'c']);
    for (const p of ['a', 'b', 'c']) {
      expect(g.state.turn!.playerId).toBe(p);
      g.roll(1, 2);
      g.endTurn();
    }
    expect(g.state.turn!.playerId).toBe('a');
  });

  it('EndTurn before rolling is ROLL_REQUIRED', () => {
    const g = playingGame(['a', 'b']);
    const r = g.submit(g.endTurnCmd());
    expect(r.kind === 'rejected' && r.error.code).toBe('ROLL_REQUIRED');
  });
});

describe('turn quotas', () => {
  it('a new turn starts with fresh quotas', () => {
    const g = playingGame(['a', 'b']);
    g.roll(1, 2);
    g.endTurn();
    expect(g.state.turn!.quotas).toEqual(TURN_QUOTAS);
  });

  it('a continuation keeps the quotas of the turn', () => {
    const g = playingGame(['a', 'b']);
    const quotas = g.state.turn!.quotas;
    g.timeout({ dice: [1, 2] });
    expect(g.state.turn!.continuation).toBe(true);
    expect(g.state.turn!.quotas).toEqual(quotas);
  });

  it('TURN_QUOTAS is one build and two offers, frozen', () => {
    expect(TURN_QUOTAS).toEqual({ builds: 1, offers: 2 });
    expect(Object.isFrozen(TURN_QUOTAS)).toBe(true);
  });
});
