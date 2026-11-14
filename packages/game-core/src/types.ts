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
