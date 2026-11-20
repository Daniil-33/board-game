import { describe, it, expect } from 'vitest';
import { playingGame, types } from './helpers/game.js';
import { CLASSIC_40 } from '../board.js';
import { CONTINUATION_MS, TURN_DURATION_MS } from '../deadlines.js';
import { TURN_QUOTAS } from '../turns.js';

// spec: engine/turn-cycle "Doubles grant a bonus turn", "Third consecutive double sends to jail"
describe('doubles grant a bonus turn', () => {
  it('manual double: the player stays in the rolled turn; EndTurn starts a bonus turn', () => {
    const g = playingGame(['a', 'b']);
    const first = g.state.turn!.turnId;
    g.roll(3, 3);
    expect(g.state.turn).toMatchObject({ turnId: first, rolled: true, pendingBonus: true, doublesStreak: 1 });
    g.now += 4_000;
    const events = g.endTurn();
    expect(types(events)).toEqual(['TurnEnded', 'TurnStarted']);
    expect(events[1]!.payload).toMatchObject({ playerId: 'a', bonus: true, deadline: g.now + TURN_DURATION_MS });
    expect(g.state.turn!.turnId).not.toBe(first);
    expect(g.state.turn).toMatchObject({ bonus: true, rolled: false, doublesStreak: 1, pendingBonus: false });
    expect(g.state.turn!.quotas).toEqual(TURN_QUOTAS);
  });

  it('manual double: a Timeout closing the turn also starts the bonus turn', () => {
    const g = playingGame(['a', 'b']);
    g.roll(2, 2);
    const oldTurn=g.state.turn!.turnId;
    const events = g.timeout();
    expect(types(events)).toEqual(['BalanceChanged','ChargePaid','TurnEnded','TurnStarted']);
    expect(events[0]!.payload).toEqual({playerId:'a',delta:-2990,balance:26920,reason:'chance'});
    expect(events[1]!.payload).toEqual({payerId:'a',amount:2990,auto:true});
    expect(events[2]!.payload).toEqual({turnId:oldTurn,playerId:'a',reason:'timeout'});
    expect(events[3]!.payload).toMatchObject({ playerId: 'a', bonus: true });
  });

  it('automatic double: the bonus turn starts after the continued turn closes', () => {
    const g = playingGame(['a', 'b']);
    const first = g.state.turn!.turnId;
    const auto = g.timeout({ dice: [5, 5] });
    expect(types(auto)).toEqual(['DiceRolled', 'PlayerMoved', 'TurnContinued']);
    expect(auto[0]!.payload).toMatchObject({ double: true, auto: true });
    expect(g.state.turn).toMatchObject({ turnId: first, pendingBonus: true, continuation: true });
    const closing = g.timeout();
    expect(types(closing)).toEqual(['TurnEnded', 'TurnStarted']);
    expect(closing[1]!.payload).toMatchObject({ playerId: 'a', bonus: true });
  });

  it('a continued turn with a pending bonus can also be closed by EndTurn', () => {
    const g = playingGame(['a', 'b']);
    g.timeout({ dice: [5, 5] });
    const closing = g.endTurn(g.now + CONTINUATION_MS - 1);
    expect(closing[1]!.payload).toMatchObject({ playerId: 'a', bonus: true });
  });

  it('the streak resets on a non-double', () => {
    const g = playingGame(['a', 'b']);
    g.roll(1, 1);
    g.endTurn();
    g.roll(1, 2);
    expect(g.state.turn).toMatchObject({ doublesStreak: 0, pendingBonus: false });
    const events = g.endTurn();
    expect(events[1]!.payload).toMatchObject({ playerId: 'b', bonus: false });
  });

  it('the streak resets when play passes to another player', () => {
    const g = playingGame(['a', 'b']);
    g.roll(1, 1); // a: streak 1
    g.endTurn();
    g.roll(2, 3); // a's bonus: non-double, streak 0
    g.endTurn();
    g.roll(4, 4); // b: streak 1
    g.endTurn();
    g.roll(6, 1);
    g.endTurn();
    expect(g.state.turn).toMatchObject({ playerId: 'a', doublesStreak: 0 });
    g.roll(2, 2);
    g.endTurn();
    g.roll(3, 3);
    expect(g.state.turn!.doublesStreak).toBe(2); // two in a row for a, not three
    expect(g.state.jail).toEqual({});
  });
});

describe('third consecutive double sends to jail', () => {
  it('manual: DiceRolled, SentToJail, TurnEnded(sent-to-jail), TurnStarted(next); no movement', () => {
    const g = playingGame(['a', 'b']);
    g.roll(1, 1);
    g.endTurn();
    g.roll(2, 2);
    g.endTurn();
    const from = g.state.positions['a']!;
    const turnId = g.state.turn!.turnId;
    const events = g.roll(4, 4);
    expect(types(events)).toEqual(['DiceRolled', 'SentToJail', 'TurnEnded', 'TurnStarted']);
    expect(events[1]!.payload).toEqual({ playerId: 'a', from, to: CLASSIC_40.jailCell });
    expect(events[2]!.payload).toEqual({ turnId, playerId: 'a', reason: 'sent-to-jail' });
    expect(events[3]!.payload).toMatchObject({ playerId: 'b', bonus: false });
    expect(g.state.positions['a']).toBe(CLASSIC_40.jailCell);
    expect(g.state.jail).toEqual({ a: { attemptsUsed: 0 } });
    expect(g.state.turn!.doublesStreak).toBe(0);
  });

  it('automatic: a third double from a Timeout sends to jail with no continuation', () => {
    const g = playingGame(['a', 'b']);
    g.roll(1, 1);
    g.endTurn();
    g.roll(2, 2);
    g.endTurn();
    const events = g.timeout({ dice: [6, 6] });
    expect(types(events)).toEqual(['DiceRolled', 'SentToJail', 'TurnEnded', 'TurnStarted']);
    expect(events[0]!.payload).toMatchObject({ auto: true, double: true });
    expect(g.state.turn!.playerId).toBe('b');
    expect(g.state.jail).toHaveProperty('a');
  });
});
