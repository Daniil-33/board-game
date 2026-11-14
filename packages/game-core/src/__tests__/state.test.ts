import { describe, it, expect } from 'vitest';
import { genesis, type GameState } from '../state.js';
import { checkInvariants, InvariantViolationError, type InvariantName } from '../invariants.js';
import { seedRng } from '../rng.js';
import type { PlayerId, Revision } from '../types.js';
import { setupGame, playingGame } from './helpers/game.js';

const pid = (s: string) => s as PlayerId;

describe('genesis', () => {
  it('has revision 0, phase uninitialized, no players, no rng', () => {
    const g = genesis();
    expect(g.revision).toBe(0);
    expect(g.phase).toBe('uninitialized');
    expect(g.players).toEqual([]);
    expect(g.rng).toBeNull();
    expect(g.rulesVersion).toBeNull();
  });

  it('satisfies invariants', () => {
    expect(() => checkInvariants(genesis())).not.toThrow();
  });
});

const lobby: GameState = {
  ...genesis(),
  revision: 3 as Revision,
  rulesVersion: 'core-2',
  phase: 'lobby',
  players: [{ id: pid('a') }, { id: pid('b') }],
  rng: seedRng(1),
};

function expectViolation(state: GameState, invariant: InvariantName) {
  try {
    checkInvariants(state);
  } catch (e) {
    expect(e).toBeInstanceOf(InvariantViolationError);
    expect((e as InvariantViolationError).invariant).toBe(invariant);
    return;
  }
  throw new Error(`expected ${invariant} violation`);
}

describe('checkInvariants', () => {
  it('passes for a valid lobby, setup and playing state', () => {
    expect(() => checkInvariants(lobby)).not.toThrow();
    expect(() => checkInvariants(setupGame(['a', 'b']).state)).not.toThrow();
    expect(() => checkInvariants(playingGame(['a', 'b']).state)).not.toThrow();
  });

  it('revision must be a non-negative integer', () => {
    expectViolation({ ...lobby, revision: -1 as Revision }, 'revision-non-negative-integer');
    expectViolation({ ...lobby, revision: 1.5 as Revision }, 'revision-non-negative-integer');
  });

  it('player ids must be unique', () => {
    expectViolation({ ...lobby, players: [{ id: pid('a') }, { id: pid('a') }] }, 'unique-player-ids');
  });

  it('at most 6 players', () => {
    const seven = ['1', '2', '3', '4', '5', '6', '7'].map((id) => ({ id: pid(id) }));
    expectViolation({ ...lobby, players: seven }, 'player-count-for-phase');
  });

  it('setup requires at least 2 players', () => {
    expectViolation({ ...setupGame(['a', 'b']).state, players: [{ id: pid('a') }] }, 'player-count-for-phase');
  });

  it('uninitialized has no players', () => {
    expectViolation({ ...genesis(), players: [{ id: pid('a') }] }, 'player-count-for-phase');
  });

  it('rng must be present and well-formed after creation', () => {
    expectViolation({ ...lobby, rng: null }, 'rng-well-formed');
    expectViolation({ ...lobby, rng: { algo: 'xoshiro128**', s: [0, 0, 0, 0] } }, 'rng-well-formed');
  });

  it('rng must be null before creation', () => {
    expectViolation({ ...genesis(), rng: seedRng(1) }, 'rng-well-formed');
  });
});

describe('phase-state-shape and ring-position invariants', () => {
  const setup = () => setupGame(['a', 'b']).state;
  const playing = () => playingGame(['a', 'b']).state;

  it('setup state only in phase setup', () => {
    expectViolation({ ...setup(), setup: null }, 'phase-state-shape');
    expectViolation({ ...lobby, setup: setup().setup }, 'phase-state-shape');
    expectViolation({ ...playing(), setup: setup().setup }, 'phase-state-shape');
  });

  it('order and turn exactly in phase playing', () => {
    expectViolation({ ...playing(), order: null }, 'phase-state-shape');
    expectViolation({ ...playing(), turn: null }, 'phase-state-shape');
    expectViolation({ ...setup(), order: [pid('a'), pid('b')] }, 'phase-state-shape');
  });

  it('order is a permutation of the players and contains the turn owner', () => {
    expectViolation({ ...playing(), order: [pid('a'), pid('a')] }, 'phase-state-shape');
    expectViolation({ ...playing(), order: [pid('a')] }, 'phase-state-shape');
    const p = playing();
    expectViolation({ ...p, turn: { ...p.turn!, playerId: pid('zz') } }, 'phase-state-shape');
  });

  it('a position for every player only in playing', () => {
    expectViolation({ ...playing(), positions: { a: 0 } }, 'phase-state-shape');
    expectViolation({ ...playing(), positions: { a: 0, b: 0, zz: 0 } }, 'phase-state-shape');
    expectViolation({ ...setup(), positions: { a: 0, b: 0 } }, 'phase-state-shape');
  });

  it('jail entries only for players in playing', () => {
    expectViolation({ ...playing(), jail: { zz: { attemptsUsed: 0 } } }, 'phase-state-shape');
    expectViolation({ ...setup(), jail: { a: { attemptsUsed: 0 } } }, 'phase-state-shape');
  });

  it('the current roller is the first pending member', () => {
    const s = setup();
    expectViolation({ ...s, setup: { ...s.setup!, playerId: pid('b') } }, 'phase-state-shape');
  });

  it('every position is a cell of the 40-cell ring', () => {
    expectViolation({ ...playing(), positions: { a: 40, b: 0 } }, 'ring-position');
    expectViolation({ ...playing(), positions: { a: -1, b: 0 } }, 'ring-position');
    expectViolation({ ...playing(), positions: { a: 1.5, b: 0 } }, 'ring-position');
    const p = playing();
    expect(() => checkInvariants({ ...p, positions: { a: 39, b: 0 } })).not.toThrow();
  });
});
