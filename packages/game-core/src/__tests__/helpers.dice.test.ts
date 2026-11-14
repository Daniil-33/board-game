import { describe, it, expect } from 'vitest';
import { absorbEntropy, seedRng } from '../rng.js';
import { rollDie, rollTwoDice } from '../dice.js';
import { forceEntropy } from './helpers/dice.js';

describe('forceEntropy test helper', () => {
  const rng = seedRng(7);

  it('forces every pair of dice', () => {
    for (let a = 1; a <= 6; a++) {
      for (let b = 1; b <= 6; b++) {
        const e = forceEntropy(rng, [a, b]);
        expect(rollTwoDice(absorbEntropy(rng, e))[0]).toEqual([a, b]);
      }
    }
  });

  it('forces every single die value', () => {
    for (let v = 1; v <= 6; v++) {
      const e = forceEntropy(rng, [v]);
      expect(rollDie(absorbEntropy(rng, e))[0]).toBe(v);
    }
  });
});
