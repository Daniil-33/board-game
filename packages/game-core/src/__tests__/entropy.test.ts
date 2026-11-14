import { describe, it, expect } from 'vitest';
import { entropy } from '../types.js';

describe('entropy', () => {
  it('accepts four uint32 words, including the bounds', () => {
    expect(entropy([0, 1, 0xffff_ffff, 123])).toEqual([0, 1, 0xffff_ffff, 123]);
  });

  it('returns a frozen copy detached from the input', () => {
    const words = [1, 2, 3, 4];
    const e = entropy(words);
    words[0] = 99;
    expect(e[0]).toBe(1);
    expect(Object.isFrozen(e)).toBe(true);
  });

  it.each([
    ['3 words', [1, 2, 3]],
    ['5 words', [1, 2, 3, 4, 5]],
    ['a negative word', [1, 2, 3, -1]],
    ['2^32', [1, 2, 3, 2 ** 32]],
    ['a fraction', [1, 2, 3, 1.5]],
    ['NaN', [1, 2, 3, Number.NaN]],
  ])('rejects %s', (_label, words) => {
    expect(() => entropy(words)).toThrow(RangeError);
  });
});
