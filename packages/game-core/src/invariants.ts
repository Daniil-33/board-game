import { isWellFormedRng } from './rng.js';
import { MAX_PLAYERS, MIN_PLAYERS, type GameState } from './state.js';
import { PLACEHOLDER_RING } from './board.js';

export type InvariantName =
  | 'revision-non-negative-integer'
  | 'unique-player-ids'
  | 'player-count-for-phase'
  | 'rng-well-formed'
  | 'phase-state-shape'
  | 'ring-position';

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

  checkPhaseShape(state);
}

function shape(detail: string): never {
  throw new InvariantViolationError('phase-state-shape', detail);
}

function sameMembers(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && new Set(a).size === a.length && a.every((x) => b.includes(x));
}

/** Phase-specific state is present exactly in its phase, and positions are ring cells. */
function checkPhaseShape(state: GameState): void {
  const ids = state.players.map((p) => p.id as string);
  const inSetup = state.phase === 'setup';
  const playing = state.phase === 'playing';

  if ((state.setup !== null) !== inSetup) shape(`setup must be present exactly in phase setup (phase ${state.phase})`);
  if ((state.order !== null) !== playing) shape(`order must be present exactly in phase playing (phase ${state.phase})`);
  if ((state.turn !== null) !== playing) shape(`turn must be present exactly in phase playing (phase ${state.phase})`);

  const positioned = Object.keys(state.positions);
  if (playing ? !sameMembers(positioned, ids) : positioned.length > 0) {
    shape(`positions must name every player exactly in phase playing (phase ${state.phase})`);
  }
  for (const p of Object.keys(state.jail)) {
    if (!playing || !ids.includes(p)) shape(`jail entry for ${p} outside playing or for a non-player`);
  }

  if (state.setup !== null) {
    const { round, playerId, groups } = state.setup;
    if (round.pending[0] !== playerId) shape(`current roller ${playerId} is not first pending`);
    if (!sameMembers(groups.flat(), ids)) shape('order-roll groups must partition the players');
  }
  if (state.order !== null && state.turn !== null) {
    if (!sameMembers(state.order, ids)) shape('order must be a permutation of the players');
    if (!state.order.includes(state.turn.playerId)) shape(`turn owner ${state.turn.playerId} is not in order`);
  }

  for (const [p, cell] of Object.entries(state.positions)) {
    if (!Number.isInteger(cell) || cell < 0 || cell >= PLACEHOLDER_RING.size) {
      throw new InvariantViolationError('ring-position', `player ${p} on cell ${cell}`);
    }
  }
}
