import { describe, it, expect } from 'vitest';
import { replay, restoreSession } from '../session.js';
import { gameEngine } from '../rules.js';
import { projectState } from '../projection.js';
import { PLACEHOLDER_RING } from '../board.js';
import { playingGame, setupGame } from './helpers/game.js';

// Regression (REV-s1-core-turns-1 RVW-002): every id AddPlayer accepts must be playable,
// including ids that name Object.prototype members. Player-keyed records must hold own keys.
const IDS = ['__proto__', 'constructor', 'toString'];

describe('player ids that name Object.prototype members', () => {
  it('reach playing with an own position for every player', () => {
    const g = playingGame(IDS);
    expect(g.state.phase).toBe('playing');
    for (const id of IDS) {
      expect(Object.hasOwn(g.state.positions, id)).toBe(true);
      expect(g.state.positions[id]).toBe(0);
    }
    expect(Object.getPrototypeOf(g.state.positions)).toBe(Object.prototype);
  });

  it('resolve order-roll ties, take turns, go to jail and get released', () => {
    const g = setupGame(IDS);
    g.rollForOrder(4);
    g.rollForOrder(4);
    g.rollForOrder(1); // tie between __proto__ and constructor
    g.rollForOrder(6); // __proto__
    g.rollForOrder(2); // constructor
    expect(g.state.order).toEqual(['__proto__', 'constructor', 'toString']);

    g.roll(1, 1); // __proto__: doubles x3 -> jail
    g.endTurn();
    g.roll(2, 2);
    g.endTurn();
    g.roll(3, 3);
    expect(Object.hasOwn(g.state.jail, '__proto__')).toBe(true);
    expect(g.state.positions['__proto__']).toBe(PLACEHOLDER_RING.jailCell);
    g.roll(1, 2); // constructor
    g.endTurn();
    g.roll(2, 3); // toString
    g.endTurn();
    g.roll(5, 5); // __proto__ released by a double, no bonus
    expect(Object.hasOwn(g.state.jail, '__proto__')).toBe(false);
    expect(g.state.positions['__proto__']).toBe(PLACEHOLDER_RING.jailCell + 10);
    g.endTurn();
    expect(g.state.turn!.playerId).toBe('constructor');

    expect(projectState(g.state, { kind: 'spectator' })).toMatchObject({ positions: g.state.positions });
  });

  it('replay and restore reproduce the game', () => {
    const g = playingGame(IDS);
    const snapshot = g.state;
    const k = g.session.log.length;
    for (let i = 0; i < 9; i++) {
      g.roll(1 + (i % 6), 1 + ((i + 2) % 6));
      g.endTurn();
    }
    expect(replay(gameEngine, g.session.log).state).toEqual(g.state);
    expect(restoreSession(gameEngine, snapshot, g.session.log.slice(k)).state).toEqual(g.state);
  });
});
