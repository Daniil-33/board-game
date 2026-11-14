import type { Timestamp } from './types.js';

/**
 * Trusted inputs supplied by the host for one transition.
 * Randomness is NOT here: it lives in the game state as a seeded RNG state.
 */
export interface TransitionContext {
  readonly now: Timestamp;
}
