import { isWellFormedRng } from './rng.js';
import { MAX_PLAYERS, MIN_PLAYERS, type GameState } from './state.js';

export type InvariantName =
  | 'revision-non-negative-integer'
  | 'unique-player-ids'
  | 'player-count-for-phase'
  | 'rng-well-formed';

/**
 * Raised when an accepted transition produced a state that breaks an invariant.
 * This is an engine defect, never a rejection of a user command.
 */
export class InvariantViolationError extends Error {
  readonly invariant: InvariantName;
  readonly detail: string;

  constructor(invariant: InvariantName, detail: string) {
    super(`Invariant violated: ${invariant} (${detail})`);
    this.name = 'InvariantViolationError';
    this.invariant = invariant;
    this.detail = detail;
  }
}

/** Throws InvariantViolationError on the first broken invariant. */
export function checkInvariants(state: GameState): void {
  const rev: number = state.revision;
  if (!Number.isSafeInteger(rev) || rev < 0) {
    throw new InvariantViolationError('revision-non-negative-integer', `revision=${rev}`);
  }

  const seen = new Set<string>();
  for (const p of state.players) {
    if (seen.has(p.id)) {
      throw new InvariantViolationError('unique-player-ids', `duplicate id ${p.id}`);
    }
    seen.add(p.id);
  }

  const count = state.players.length;
  const [min, max] =
    state.phase === 'uninitialized' ? [0, 0] : state.phase === 'lobby' ? [0, MAX_PLAYERS] : [MIN_PLAYERS, MAX_PLAYERS];
  if (count < min || count > max) {
    throw new InvariantViolationError(
      'player-count-for-phase',
      `phase ${state.phase} allows ${min}..${max} players, has ${count}`,
    );
  }

  if (state.phase === 'uninitialized') {
    if (state.rng !== null) {
      throw new InvariantViolationError('rng-well-formed', 'rng must be null before CreateGame');
    }
  } else if (!isWellFormedRng(state.rng)) {
    throw new InvariantViolationError('rng-well-formed', `phase ${state.phase} requires a well-formed rng`);
  }
}
