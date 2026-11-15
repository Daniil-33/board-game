import { entropy } from '@game/game-core';
import type { EntropySource } from '../../context/entropy.js';

/**
 * Deterministic entropy: the same seed gives the same sequence. Not random.
 * Timeout command ids are drawn from the entropy source, so a process that
 * restarts on an existing database must use a seed it has not used before,
 * otherwise its Timeout ids repeat ids already in the log.
 */
export function seededEntropy(seed = 1): EntropySource {
  let s = seed >>> 0;
  const word = (): number => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };
  return { next: () => entropy([word(), word(), word(), word()]) };
}
