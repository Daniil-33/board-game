declare const _brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [_brand]: B };

export type Money = Brand<number, 'Money'>;
export type PlayerId = Brand<string, 'PlayerId'>;
export type AssetId = Brand<string, 'AssetId'>;
export type CommandId = Brand<string, 'CommandId'>;
export type Revision = Brand<number, 'Revision'>;
/** Milliseconds since the Unix epoch; a non-negative integer. */
export type Timestamp = Brand<number, 'Timestamp'>;

/** The only sanctioned way to produce a `Timestamp`. */
export function timestamp(ms: number): Timestamp {
  if (!Number.isSafeInteger(ms) || ms < 0) {
    throw new RangeError(`Timestamp must be a non-negative integer of milliseconds, got ${ms}`);
  }
  return ms as Timestamp;
}

/**
 * 128 bits of host-supplied entropy for one transition, as four uint32 words.
 * The host draws it from a CSPRNG; the core only mixes it into the state RNG.
 */
export type Entropy = Brand<readonly [number, number, number, number], 'Entropy'>;

/** The only sanctioned way to produce an `Entropy`. Returns a frozen copy. */
export function entropy(words: readonly number[]): Entropy {
  if (!Array.isArray(words) || words.length !== 4) {
    throw new RangeError(`Entropy must be exactly 4 uint32 words, got ${Array.isArray(words) ? words.length : typeof words}`);
  }
  for (const w of words) {
    if (!Number.isInteger(w) || w < 0 || w > 0xffff_ffff) {
      throw new RangeError(`Entropy words must be integers in [0, 2^32 - 1], got ${w}`);
    }
  }
  return Object.freeze([words[0], words[1], words[2], words[3]]) as unknown as Entropy;
}
