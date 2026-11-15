import { randomInt } from 'node:crypto';
import { entropy } from '@game/game-core';
import { csprngEntropy, type EntropySource } from './entropy.js';

export interface ServerContext {
  readonly entropy: EntropySource;
  readonly gameSeed: () => number;
}

/** Explicit test opt-in only. Validate before opening any database or socket. */
export function readTestSeed(env: NodeJS.ProcessEnv): number | undefined {
  const text = env['E2E_TEST_SEED'];
  if (text === undefined) return undefined;
  if (env['NODE_ENV'] !== 'test') throw new Error('E2E_TEST_SEED requires NODE_ENV=test');
  if (!/^(0|[1-9][0-9]*)$/.test(text) || Number(text) > 0xffffffff) {
    throw new Error('E2E_TEST_SEED must be a uint32 decimal integer');
  }
  return Number(text);
}

/** Test streams must use a fresh DB; restarting them repeats timeout IDs. */
export function createServerContext(seed: number | undefined): ServerContext {
  if (seed === undefined) return { entropy: csprngEntropy, gameSeed: () => randomInt(0, 2 ** 32) };
  let state = seed >>> 0;
  const word = (): number => {
    state = (state + 0x9e3779b9) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };
  return { gameSeed: () => seed, entropy: { next: () => entropy([word(), word(), word(), word()]) } };
}
