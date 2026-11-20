import { describe, expect, it } from 'vitest';
import type { ClientCommandType } from '@game/protocol';
import {
  actionAvailability,
  activeDeadline,
  activePlayerId,
  commandExpectation,
  remainingMs,
  remainingSeconds,
  turnOrder,
  type ActionAvailability,
  type ActionContext,
} from '../entities/game/index';
import { lobbyView, pid, playingView, setupView } from './helpers';

const NONE: ActionAvailability = { RollForOrder: false, RollDice: false, EndTurn: false, Resign: false, BuyAsset: false, StartAuction: false, Bid: false, PassAuction: false, PayRent: false, PlaceCasinoBet: false, DeclineCasino: false, PayJailFee: false };

function available(over: Partial<ActionContext>): ActionAvailability {
  return actionAvailability({ view: null, me: pid('a'), connected: true, pending: [], now: 50_000, ...over });
}

describe('action buttons follow the view', () => {
  it('not my turn: only resignation available', () => {
    expect(available({ view: playingView(['a', 'b'], { owner: 'b' }) })).toEqual({ ...NONE, Resign: true });
    expect(available({ view: playingView(['a', 'b'], { owner: 'b', rolled: true }) })).toEqual({ ...NONE, Resign: true });
  });

  it('my turn before the roll: only RollDice', () => {
    expect(available({ view: playingView(['a', 'b'], { owner: 'a' }) })).toEqual({ ...NONE, Resign: true, RollDice: true });
  });

  it('my turn after the roll: only EndTurn', () => {
    expect(available({ view: playingView(['a', 'b'], { owner: 'a', rolled: true }) })).toEqual({ ...NONE, Resign: true, EndTurn: true });
  });

  it('my order roll: only RollForOrder', () => {
    expect(available({ view: setupView(['a', 'b'], { roller: 'a' }) })).toEqual({ ...NONE, Resign: true, RollForOrder: true });
    expect(available({ view: setupView(['a', 'b'], { roller: 'b' }) })).toEqual({ ...NONE, Resign: true });
  });

  it('a pending command of the type disables its button', () => {
    expect(available({ view: playingView(['a', 'b'], { owner: 'a' }), pending: ['RollDice'] })).toEqual({ ...NONE, Resign: true });
    // A pending command of another type does not.
    expect(available({ view: playingView(['a', 'b'], { owner: 'a', rolled: true }), pending: ['RollDice'] })).toEqual({
      ...NONE,
      Resign: true,
      EndTurn: true,
    });
  });

  it('disabled while disconnected, without a view or a player id, and in the lobby', () => {
    const view = playingView(['a', 'b'], { owner: 'a' });
    expect(available({ view, connected: false })).toEqual(NONE);
    expect(available({ view, me: null })).toEqual(NONE);
    expect(available({ view: null })).toEqual(NONE);
    expect(available({ view: lobbyView(['a', 'b']) })).toEqual(NONE);
  });

  it('disabled once the deadline has passed', () => {
    const view = playingView(['a', 'b'], { owner: 'a', deadline: 60_000 });
    expect(available({ view, now: 59_999 }).RollDice).toBe(true);
    expect(available({ view, now: 60_000 }).RollDice).toBe(false);
    expect(available({ view: setupView(['a', 'b'], { roller: 'a', deadline: 60_000 }), now: 60_001 })).toEqual({ ...NONE, Resign: true });
  });
});

describe('timer', () => {
  it('reads the deadline of the current phase', () => {
    expect(activeDeadline(setupView(['a', 'b'], { deadline: 111 }))).toBe(111);
    expect(activeDeadline(playingView(['a', 'b'], { deadline: 222 }))).toBe(222);
    expect(activeDeadline(lobbyView(['a']))).toBeNull();
    expect(activeDeadline(null)).toBeNull();
  });

  it('is the deadline minus now, never below zero', () => {
    expect(remainingMs(62_400, 50_000)).toBe(12_400);
    expect(remainingMs(50_000, 50_000)).toBe(0);
    expect(remainingMs(40_000, 50_000)).toBe(0);
    expect(remainingSeconds(62_400, 50_000)).toBe(13);
    expect(remainingSeconds(50_001, 50_000)).toBe(1);
    expect(remainingSeconds(40_000, 50_000)).toBe(0);
  });
});

describe('turn order', () => {
  it('playing: the view order with the turn owner active', () => {
    const entries = turnOrder(playingView(['b', 'a', 'c'], { owner: 'a', jail: { c: { attemptsUsed: 1 } } }));
    expect(entries.map((e) => e.playerId)).toEqual(['b', 'a', 'c']);
    expect(entries.map((e) => e.active)).toEqual([false, true, false]);
    expect(entries.map((e) => e.jail)).toEqual([null, null, { attemptsUsed: 1 }]);
    expect(activePlayerId(playingView(['b', 'a', 'c'], { owner: 'a' }))).toBe('a');
  });

  it('setup: groups best first, ties marked, rolls of the round shown', () => {
    const entries = turnOrder(setupView(['a', 'b', 'c'], { groups: [['c'], ['a', 'b']], roller: 'b', rolls: { a: 4 } }));
    expect(entries.map((e) => e.playerId)).toEqual(['c', 'a', 'b']);
    expect(entries.map((e) => e.tied)).toEqual([false, true, true]);
    expect(entries.map((e) => e.tieRolled)).toEqual([false, true, true]);
    expect(entries.map((e) => e.roll)).toEqual([null, 4, null]);
    expect(entries.map((e) => e.active)).toEqual([false, false, true]);
  });

  it('setup: a single group of everyone is unresolved, but not known to be a rolled tie', () => {
    const entries = turnOrder(setupView(['a', 'b']));
    expect(entries.map((e) => e.tied)).toEqual([true, true]);
    expect(entries.map((e) => e.tieRolled)).toEqual([false, false]);
  });

  it('lobby: join order; no view: empty', () => {
    expect(turnOrder(lobbyView(['b', 'a'])).map((e) => e.playerId)).toEqual(['b', 'a']);
    expect(turnOrder(null)).toEqual([]);
  });
});

describe('command expectation', () => {
  it('names the setup roll or the turn from the view', () => {
    expect(commandExpectation(setupView(['a', 'b'], { setupRollId: 's3' }), 'RollForOrder')).toEqual({
      kind: 'target',
      target: { kind: 'setupRoll', id: 's3' },
    });
    const playing = playingView(['a', 'b'], { turnId: 't7' });
    expect(commandExpectation(playing, 'RollDice')).toEqual({ kind: 'target', target: { kind: 'turn', id: 't7' } });
    expect(commandExpectation(playing, 'EndTurn')).toEqual({ kind: 'target', target: { kind: 'turn', id: 't7' } });
  });

  it('is null when the view has no such target', () => {
    expect(commandExpectation(playingView(['a', 'b']), 'RollForOrder')).toBeNull();
    expect(commandExpectation(setupView(['a', 'b']), 'RollDice')).toBeNull();
    expect(commandExpectation(null, 'EndTurn')).toBeNull();
  });
});
