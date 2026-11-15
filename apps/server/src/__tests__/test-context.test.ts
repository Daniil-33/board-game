import { describe, expect, it } from 'vitest';
import { csprngEntropy } from '../context/entropy.js';
import { createServerContext, readTestSeed } from '../context/test-context.js';

describe('explicit deterministic test context', () => {
  it.each([undefined, 'production', 'development', 'TEST', ''])('refuses seed outside test: %s', (mode) => {
    for (const seed of ['', '0', '123']) {
      expect(() => readTestSeed({ NODE_ENV: mode, E2E_TEST_SEED: seed })).toThrow('requires NODE_ENV=test');
    }
  });
  it.each(['', '-1', '1.5', ' 1', '01', '1e2', '4294967296', 'Infinity'])('rejects invalid seed %s', (seed) => {
    expect(() => readTestSeed({ NODE_ENV: 'test', E2E_TEST_SEED: seed })).toThrow('uint32');
  });
  it.each(['0', '1', '4294967295'])('accepts uint32 %s', (seed) => {
    expect(readTestSeed({ NODE_ENV: 'test', E2E_TEST_SEED: seed })).toBe(Number(seed));
  });
  it('defaults to CSPRNG even in test mode', () => {
    expect(readTestSeed({ NODE_ENV: 'test' })).toBeUndefined();
    const context = createServerContext(undefined);
    expect(context.entropy).toBe(csprngEntropy);
    const seeds = Array.from({ length: 10 }, context.gameSeed);
    expect(new Set(seeds).size).toBeGreaterThan(1);
    for (const seed of seeds) expect(Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff).toBe(true);
  });
  it('repeats both streams exactly in a fresh context', () => {
    const a = createServerContext(123), b = createServerContext(123);
    expect(a.gameSeed()).toBe(123);
    expect(b.gameSeed()).toBe(123);
    const sequence = Array.from({ length: 10 }, () => a.entropy.next());
    expect(sequence).toEqual(Array.from({ length: 10 }, () => b.entropy.next()));
    expect(sequence[0]).not.toEqual(sequence[1]);
  });
});
