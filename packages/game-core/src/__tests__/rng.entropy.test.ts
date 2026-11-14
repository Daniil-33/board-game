import { describe, it, expect } from 'vitest';
import { absorbEntropy, isWellFormedRng, seedRng, type RngState } from '../rng.js';
import { entropy } from '../types.js';
import { deepFreeze } from './helpers/fixtures.js';

// Golden vectors computed by an independent Python reference of the
// forward+backward chained splitmix32 absorption. Changing them is a rules change.
const GOLDEN: ReadonlyArray<{ seed: number; e: number[]; s: number[] }> = [
  { seed: 42, e: [1, 2, 3, 4], s: [4150499358, 2453119300, 3873641059, 1364269949] },
  { seed: 42, e: [0, 0, 0, 0], s: [289331283, 1845373680, 3359603603, 3770183811] },
];

describe('absorbEntropy', () => {
  it.each(GOLDEN)('matches the golden vector for seed $seed, entropy $e', ({ seed, e, s }) => {
    expect(absorbEntropy(seedRng(seed), entropy(e)).s).toEqual(s);
  });

  it('does not mutate its input', () => {
    const rng = deepFreeze(seedRng(7));
    const before = [...rng.s];
    absorbEntropy(rng, entropy([5, 6, 7, 8]));
    expect(rng.s).toEqual(before);
  });

  it('yields a well-formed state from an all-zero state and all-zero entropy', () => {
    const zero = { algo: 'xoshiro128**', s: [0, 0, 0, 0] } as unknown as RngState;
    expect(isWellFormedRng(absorbEntropy(zero, entropy([0, 0, 0, 0])))).toBe(true);
  });

  it('flipping any single sampled entropy bit changes every output word', () => {
    const rng = seedRng(42);
    const base = [0x12345678, 0x9abcdef0, 0x0fedcba9, 0x87654321];
    const ref = absorbEntropy(rng, entropy(base)).s;
    // 32 sampled positions: every word, bits spread across the word.
    for (let word = 0; word < 4; word++) {
      for (const bit of [0, 3, 7, 12, 17, 22, 27, 31]) {
        const flipped = [...base];
        flipped[word] = ((flipped[word] as number) ^ (1 << bit)) >>> 0;
        const out = absorbEntropy(rng, entropy(flipped)).s;
        for (let i = 0; i < 4; i++) {
          expect(out[i], `word ${word} bit ${bit} -> output ${i}`).not.toBe(ref[i]);
        }
      }
    }
  });
});
