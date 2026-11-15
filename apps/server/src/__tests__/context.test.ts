import { describe, expect, it } from 'vitest';
import { entropy } from '@game/game-core';
import { systemClock } from '../context/clock.js';
import { csprngEntropy, entropyHex } from '../context/entropy.js';
import { seededEntropy } from './helpers/seeded-entropy.js';

// spec: server/rooms "Server-supplied context"
describe('context sources', () => {
  it('production entropy is four uint32 words and differs between calls', () => {
    const a = csprngEntropy.next();
    const b = csprngEntropy.next();
    for (const value of [a, b]) {
      expect(value).toHaveLength(4);
      expect(() => entropy([...value])).not.toThrow();
    }
    expect(a).not.toEqual(b);
  });

  it('entropyHex is 32 hex digits, zero padded', () => {
    expect(entropyHex(entropy([0, 1, 0xffffffff, 0xabc]))).toBe('0000000000000001ffffffff00000abc');
  });

  it('seeded entropy repeats for a seed and differs across seeds', () => {
    const a = seededEntropy(7);
    const b = seededEntropy(7);
    const c = seededEntropy(8);
    const first = a.next();
    expect(b.next()).toEqual(first);
    expect(c.next()).not.toEqual(first);
    expect(a.next()).not.toEqual(first);
  });

  it('the system clock returns integer milliseconds', () => {
    const before = Date.now();
    const now = systemClock.now();
    expect(Number.isSafeInteger(now)).toBe(true);
    expect(now).toBeGreaterThanOrEqual(before);
  });
});
