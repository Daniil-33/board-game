import { randomBytes } from 'node:crypto';
import { entropy, type Entropy } from '@game/game-core';

/** Source of the 128 bits of host entropy the core mixes into every transition. */
export interface EntropySource {
  next(): Entropy;
}

/** Production source: 128 bits from the operating system CSPRNG per call. */
export const csprngEntropy: EntropySource = {
  next() {
    const bytes = randomBytes(16);
    return entropy([bytes.readUInt32BE(0), bytes.readUInt32BE(4), bytes.readUInt32BE(8), bytes.readUInt32BE(12)]);
  },
};

/** 32 lowercase hex digits. */
export function entropyHex(value: Entropy): string {
  return value.map((word) => word.toString(16).padStart(8, '0')).join('');
}
