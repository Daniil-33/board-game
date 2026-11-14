import { describe, it, expect } from 'vitest';
import { genesis, type GameState } from '../state.js';
import { checkInvariants, InvariantViolationError, type InvariantName } from '../invariants.js';
import { seedRng } from '../rng.js';
import type { PlayerId, Revision } from '../types.js';

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
  revision: 3 as Revision,
  rulesVersion: 'core-1',
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
  it('passes for a valid lobby and setup state', () => {
    expect(() => checkInvariants(lobby)).not.toThrow();
    expect(() => checkInvariants({ ...lobby, phase: 'setup' })).not.toThrow();
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
    expectViolation({ ...lobby, phase: 'setup', players: [{ id: pid('a') }] }, 'player-count-for-phase');
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
