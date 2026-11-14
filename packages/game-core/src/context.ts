import type { Entropy, Timestamp } from './types.js';

/**
 * Trusted inputs supplied by the host for one transition.
 * `entropy` is fresh host randomness (e.g. from a CSPRNG) for every command;
 * the engine mixes it into the seeded RNG state held in the game state.
 */
export interface TransitionContext {
  readonly now: Timestamp;
  readonly entropy: Entropy;
}
