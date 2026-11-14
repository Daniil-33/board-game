import type { RngState } from './rng.js';
import { nextIntInclusive } from './rng.js';

/** One six-sided die from the game RNG. */
export function rollDie(rng: RngState): [number, RngState] {
  return nextIntInclusive(rng, 1, 6);
}

/** Two six-sided dice, first die drawn first. */
export function rollTwoDice(rng: RngState): [readonly [number, number], RngState] {
  const [d1, r1] = rollDie(rng);
  const [d2, r2] = rollDie(r1);
  return [[d1, d2], r2];
}

/** `null` payload check shared by the stage 1 player and timeout commands. */
export function isNullPayload(payload: unknown): boolean {
  return payload === null;
}
