/**
 * Pure, seedable PRNG whose whole state is plain JSON data stored in GameState.
 *
 * Algorithm: xoshiro128** (Blackman & Vigna), state seeded by splitmix32.
 * Every function returns a NEW state and never mutates its input, so a handler
 * that draws and then rejects cannot leak consumed randomness.
 *
 * Only 32-bit integer operations (`Math.imul`, `>>>`, `^`, `<<`) are used, so
 * the output stream is bit-identical on every JavaScript engine. Changing this
 * stream is a rules change and requires a new rules version.
 */

export const RNG_ALGORITHM = 'xoshiro128**' as const;

export interface RngState {
  readonly algo: typeof RNG_ALGORITHM;
  readonly s: readonly [number, number, number, number];
}

const UINT32_RANGE = 0x1_0000_0000;

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

/** One splitmix32 step: returns [output, nextState]. */
function splitmix32(state: number): [number, number] {
  const next = (state + 0x9e3779b9) >>> 0;
  let z = next;
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
  z = (z ^ (z >>> 15)) >>> 0;
  return [z, next];
}

export function isValidSeed(seed: unknown): seed is number {
  return typeof seed === 'number' && Number.isInteger(seed) && seed >= 0 && seed < UINT32_RANGE;
}

/** Expand a 32-bit seed into a xoshiro128** state. Throws on an invalid seed. */
export function seedRng(seed: number): RngState {
  if (!isValidSeed(seed)) {
    throw new RangeError(`RNG seed must be an integer in [0, 2^32 - 1], got ${seed}`);
  }
  let sm = seed >>> 0;
  const words: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [out, next] = splitmix32(sm);
    words.push(out);
    sm = next;
  }
  const [a, b, c, d] = words as [number, number, number, number];
  // splitmix32 is a bijection per step, so four consecutive zero outputs cannot occur;
  // the guard documents the xoshiro all-zero precondition anyway.
  if ((a | b | c | d) === 0) {
    return { algo: RNG_ALGORITHM, s: [1, 0, 0, 0] };
  }
  return { algo: RNG_ALGORITHM, s: [a, b, c, d] };
}

/** Structural validity check, used by state invariants. */
export function isWellFormedRng(rng: unknown): rng is RngState {
  if (typeof rng !== 'object' || rng === null) return false;
  const r = rng as { algo?: unknown; s?: unknown };
  if (r.algo !== RNG_ALGORITHM || !Array.isArray(r.s) || r.s.length !== 4) return false;
  let any = 0;
  for (const w of r.s) {
    if (typeof w !== 'number' || !Number.isInteger(w) || w < 0 || w >= UINT32_RANGE) return false;
    any |= w;
  }
  return any !== 0;
}

/** Draw a uniform uint32. */
export function nextUint32(rng: RngState): [number, RngState] {
  let [s0, s1, s2, s3] = rng.s;
  const result = Math.imul(rotl(Math.imul(s1, 5) >>> 0, 7), 9) >>> 0;
  const t = (s1 << 9) >>> 0;
  s2 = (s2 ^ s0) >>> 0;
  s3 = (s3 ^ s1) >>> 0;
  s1 = (s1 ^ s2) >>> 0;
  s0 = (s0 ^ s3) >>> 0;
  s2 = (s2 ^ t) >>> 0;
  s3 = rotl(s3, 11);
  return [result, { algo: RNG_ALGORITHM, s: [s0, s1, s2, s3] }];
}

/**
 * Draw a uniform integer in [lo, hi] using rejection sampling (no modulo bias,
 * no floating-point scaling).
 */
export function nextIntInclusive(rng: RngState, lo: number, hi: number): [number, RngState] {
  if (!Number.isSafeInteger(lo) || !Number.isSafeInteger(hi) || hi < lo) {
    throw new RangeError(`nextIntInclusive requires integers lo <= hi, got [${lo}, ${hi}]`);
  }
  const span = hi - lo + 1;
  if (span > UINT32_RANGE) {
    throw new RangeError(`nextIntInclusive range too large: ${span}`);
  }
  // Largest multiple of `span` not exceeding 2^32; values at or above it are rejected.
  const limit = UINT32_RANGE - (UINT32_RANGE % span);
  let state = rng;
  for (;;) {
    const [u, next] = nextUint32(state);
    state = next;
    if (u < limit) return [lo + (u % span), state];
  }
}
