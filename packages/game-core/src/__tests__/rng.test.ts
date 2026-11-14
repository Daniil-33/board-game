import { describe, it, expect } from 'vitest';
import {
  seedRng,
  nextUint32,
  nextIntInclusive,
  isWellFormedRng,
  type RngState,
} from '../rng.js';

// Golden vectors produced by an independent C reference implementation of
// splitmix32 seeding + xoshiro128** using native uint32 arithmetic.
// Changing these values is a rules change: bump the rules version.
const GOLDEN: ReadonlyArray<{ seed: number; state: number[]; out: number[] }> = [
  {
    seed: 0,
    state: [1684164658, 3653269916, 2939563536, 2141751570],
    out: [1789933344, 44971166, 2521387044, 3848737593, 1138324114, 749234105, 1899511038, 1995189375],
  },
  {
    seed: 42,
    state: [551831576, 144025891, 322543647, 3034809370],
    out: [660444221, 3652823732, 77672526, 910233633, 2297337756, 3786072677, 3123505064, 1891482476],
  },
  {
    seed: 4294967295,
    state: [3950124170, 4293442868, 1302505678, 2762329221],
    out: [4104197751, 1825856343, 1152209388, 2427537429, 3685145430, 609215610, 4161674276, 1502890106],
  },
];

function take(rng: RngState, n: number): number[] {
  const out: number[] = [];
  let r = rng;
  for (let i = 0; i < n; i++) {
    const [v, next] = nextUint32(r);
    out.push(v);
    r = next;
  }
  return out;
}

describe('rng: seeding and golden vectors', () => {
  for (const g of GOLDEN) {
    it(`seed ${g.seed} matches reference state and first 8 outputs`, () => {
      const rng = seedRng(g.seed);
      expect(rng.s).toEqual(g.state);
      expect(take(rng, 8)).toEqual(g.out);
    });
  }

  it('same seed yields deep-equal state and stream', () => {
    expect(seedRng(7)).toEqual(seedRng(7));
    expect(take(seedRng(7), 16)).toEqual(take(seedRng(7), 16));
  });

  it('rejects invalid seeds', () => {
    expect(() => seedRng(1.5)).toThrow(RangeError);
    expect(() => seedRng(-1)).toThrow(RangeError);
    expect(() => seedRng(2 ** 32)).toThrow(RangeError);
  });

  it('seeded state is well-formed', () => {
    expect(isWellFormedRng(seedRng(0))).toBe(true);
    expect(isWellFormedRng({ algo: 'xoshiro128**', s: [0, 0, 0, 0] })).toBe(false);
    expect(isWellFormedRng({ algo: 'other', s: [1, 2, 3, 4] })).toBe(false);
    expect(isWellFormedRng({ algo: 'xoshiro128**', s: [1, 2, 3] })).toBe(false);
  });
});

describe('rng: purity', () => {
  it('drawing does not mutate the input state', () => {
    const rng = Object.freeze({ ...seedRng(42), s: Object.freeze([...seedRng(42).s]) }) as RngState;
    const snapshot = JSON.stringify(rng);
    const [, next] = nextUint32(rng);
    nextIntInclusive(rng, 1, 6);
    expect(JSON.stringify(rng)).toBe(snapshot);
    expect(next).not.toBe(rng);
    expect(next.s).not.toEqual(rng.s);
  });
});

describe('rng: nextIntInclusive', () => {
  it('stays in range and is roughly uniform for a d6', () => {
    const counts = [0, 0, 0, 0, 0, 0];
    let rng = seedRng(12345);
    for (let i = 0; i < 60_000; i++) {
      const [v, next] = nextIntInclusive(rng, 1, 6);
      rng = next;
      expect(v >= 1 && v <= 6 && Number.isInteger(v)).toBe(true);
      counts[v - 1]! += 1;
    }
    for (const c of counts) {
      expect(c).toBeGreaterThanOrEqual(9_500);
      expect(c).toBeLessThanOrEqual(10_500);
    }
  });

  it('degenerate range returns lo', () => {
    expect(nextIntInclusive(seedRng(1), 3, 3)[0]).toBe(3);
  });

  it('rejects bad ranges', () => {
    expect(() => nextIntInclusive(seedRng(1), 6, 1)).toThrow(RangeError);
    expect(() => nextIntInclusive(seedRng(1), 0, 1.5)).toThrow(RangeError);
  });
});
