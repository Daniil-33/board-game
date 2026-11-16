import { describe, it, expect } from 'vitest';
import { playingGame, types, type Game } from './helpers/game.js';
import { CLASSIC_40 } from '../board.js';
import { INTERIM_JAIL_RULE } from '../interim-jail.js';

// spec: engine/interim-jail
const JAIL = CLASSIC_40.jailCell;

/** a goes to jail by three doubles; b then plays a plain turn; a's turn is next. */
function prisonerUp(): Game {
  const g = playingGame(['a', 'b']);
  g.roll(1, 1);
  g.endTurn();
  g.roll(2, 2);
  g.endTurn();
  g.roll(3, 3); // third double: jail, turn passes to b
  g.roll(1, 2);
  g.endTurn();
  return g;
}

/** b plays a plain turn so that play returns to a. */
function otherTurn(g: Game) {
  g.roll(1, 2);
  g.endTurn();
}

describe('INTERIM_JAIL_RULE', () => {
  it('is marked temporary and replaced in stage 6', () => {
    expect(INTERIM_JAIL_RULE).toEqual({ temporary: true, replacedInStage: 6, maxAttempts: 3 });
    expect(Object.isFrozen(INTERIM_JAIL_RULE)).toBe(true);
  });
});

describe('prisoner takes their turn', () => {
  it('play passes to the prisoner, who is not skipped', () => {
    const g = playingGame(['a', 'b']);
    g.roll(1, 1);
    g.endTurn();
    g.roll(2, 2);
    g.endTurn();
    g.roll(3, 3);
    g.roll(1, 2);
    const events = g.endTurn();
    expect(events[1]).toMatchObject({ type: 'TurnStarted', payload: { playerId: 'a', bonus: false } });
    expect(g.state.jail).toEqual({ a: { attemptsUsed: 0 } });
  });
});

describe('release by a double', () => {
  it('releases and moves by the sum with no bonus turn', () => {
    const g = prisonerUp();
    const events = g.roll(2, 2);
    expect(types(events)).toEqual(['DiceRolled', 'InterimJailReleased', 'PlayerMoved', 'PurchaseOffered']);
    expect(events[0]!.payload).toMatchObject({ double: true, auto: false });
    expect(events[1]!.payload).toEqual({ playerId: 'a', reason: 'double' });
    expect(events[2]!.payload).toEqual({ playerId: 'a', from: JAIL, to: JAIL + 4, steps: 4 });
    expect(g.state.jail).toEqual({});
    expect(g.state.turn).toMatchObject({ pendingBonus: false, doublesStreak: 0 });
    const closing = g.endTurn();
    expect(closing[1]!.payload).toMatchObject({ playerId: 'b', bonus: false });
  });
});

describe('failed attempts', () => {
  it('two failures stay in jail without moving; the third failure releases and moves by its sum', () => {
    const g = prisonerUp();
    const first = g.roll(1, 2);
    expect(types(first)).toEqual(['DiceRolled', 'InterimJailAttemptFailed']);
    expect(first[1]!.payload).toEqual({ playerId: 'a', attemptsUsed: 1 });
    expect(g.state.positions['a']).toBe(JAIL);
    g.endTurn();
    otherTurn(g);

    const second = g.roll(3, 4);
    expect(second[1]!.payload).toEqual({ playerId: 'a', attemptsUsed: 2 });
    expect(g.state.positions['a']).toBe(JAIL);
    g.endTurn();
    otherTurn(g);

    const third = g.roll(5, 1);
    expect(types(third)).toEqual(['DiceRolled', 'InterimJailReleased', 'PlayerMoved', 'PurchaseOffered']);
    expect(third[1]!.payload).toEqual({ playerId: 'a', reason: 'attempts-exhausted' });
    expect(third[2]!.payload).toEqual({ playerId: 'a', from: JAIL, to: JAIL + 6, steps: 6 });
    expect(g.state.jail).toEqual({});
  });

  it('a Timeout before the roll makes the attempt automatically and continues the turn', () => {
    const g = prisonerUp();
    const events = g.timeout({ dice: [4, 2] });
    expect(types(events)).toEqual(['DiceRolled', 'InterimJailAttemptFailed', 'TurnContinued']);
    expect(events[0]!.payload).toMatchObject({ auto: true });
    expect(g.state.turn).toMatchObject({ playerId: 'a', continuation: true, rolled: true });
    const closing = g.timeout();
    expect(closing[1]!.payload).toMatchObject({ playerId: 'b', bonus: false });
  });

  it('an automatic double releases without a bonus turn', () => {
    const g = prisonerUp();
    const events = g.timeout({ dice: [6, 6] });
    expect(types(events)).toEqual(['DiceRolled', 'InterimJailReleased', 'PlayerMoved', 'TurnContinued']);
    expect(g.timeout()[1]!.payload).toMatchObject({ playerId: 'b', bonus: false });
  });
});

describe('jail attempts and the doubles streak', () => {
  it('a release double does not count toward the streak: two more doubles after release do not jail', () => {
    const g = prisonerUp();
    g.roll(2, 2); // released by a double, streak stays 0, no bonus
    g.endTurn();
    otherTurn(g);
    g.roll(1, 1);
    g.endTurn();
    g.roll(5, 5);
    expect(g.state.turn!.doublesStreak).toBe(2);
    expect(g.state.jail).toEqual({});
  });
});
