import type { PlayerId, Revision } from './types.js';
import type { RngState } from './rng.js';

/**
 * Game phases known to this rules version.
 * `uninitialized` -> `lobby` (CreateGame) -> `setup` (StartGame).
 * `setup` accepts no commands yet; turn-order rolls arrive in a later change.
 */
export type Phase = 'uninitialized' | 'lobby' | 'setup';

export interface PlayerState {
  readonly id: PlayerId;
}

export interface GameState {
  readonly revision: Revision;
  /** Rules version the game was created under; null before CreateGame. */
  readonly rulesVersion: string | null;
  readonly phase: Phase;
  /** Players in join order. */
  readonly players: readonly PlayerState[];
  /** Seeded RNG state; null before CreateGame. */
  readonly rng: RngState | null;
}

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;

/** The state every game starts from. */
export function genesis(): GameState {
  return {
    revision: 0 as Revision,
    rulesVersion: null,
    phase: 'uninitialized',
    players: [],
    rng: null,
  };
}
