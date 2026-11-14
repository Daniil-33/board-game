import { absorbEntropy, type RngState } from '../../rng.js';
import { entropy, type Entropy } from '../../types.js';
import { rollDie, rollTwoDice } from '../../dice.js';

/** Bounded so a broken RNG path fails loudly instead of hanging. */
const MAX_TRIES = 100_000;

/** Deterministic candidate entropy for search step `i`. */
function candidate(i: number): Entropy {
  return entropy([(i * 0x9e3779b1) >>> 0, 0x5eed_0001, (i ^ 0xa5a5a5a5) >>> 0, 0x0d1ce000]);
}

/**
 * Entropy that makes the engine's next draw(s) from `rng` produce `values`
 * (one die for an order roll, two for a turn roll). Exercises the real
 * absorb-then-draw path rather than stubbing the RNG.
 */
export function forceEntropy(rng: RngState, values: readonly number[]): Entropy {
  for (let i = 0; i < MAX_TRIES; i++) {
    const e = candidate(i);
    const mixed = absorbEntropy(rng, e);
    if (values.length === 1) {
      if (rollDie(mixed)[0] === values[0]) return e;
    } else {
      const [d] = rollTwoDice(mixed);
      if (d[0] === values[0] && d[1] === values[1]) return e;
    }
  }
  throw new Error(`could not force dice ${values.join(',')} within ${MAX_TRIES} tries`);
}
