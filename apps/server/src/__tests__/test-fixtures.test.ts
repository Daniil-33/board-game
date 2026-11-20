import { describe, expect, it } from 'vitest';
import { checkInvariants, CURRENT_RULES_VERSION } from '@game/game-core';
import { buildFixture, FIXTURE_NAMES } from '../test-fixtures.js';
import { fixturesEnabled, readConfig } from '../main-config.js';
import { readFile } from 'node:fs/promises';

it.each(FIXTURE_NAMES)('%s is deterministic and invariant checked for 2–6 guests', name => {
  for (let n = 2; n <= 6; n++) {
    const ids = Array.from({ length: n }, (_, i) => `g-${i}`);
    const state = buildFixture(name, ids, 1767225600000);
    checkInvariants(state);
    expect(state).toEqual(buildFixture(name, ids, 1767225600000));
    expect(state.rulesVersion).toBe(CURRENT_RULES_VERSION);
    expect(() => checkInvariants({ ...state, houses: { unknown: 5 } })).toThrow();
  }
});
describe('fixture environment', () => {
  it.each([undefined, 'production', 'staging', 'development'])('refuses %s opt-in at startup', NODE_ENV => {
    const env = { ...(NODE_ENV ? { NODE_ENV } : {}), E2E_FIXTURES: '1' };
    expect(() => fixturesEnabled(env)).toThrow('E2E_FIXTURES');
    expect(() => readConfig(env)).toThrow('E2E_FIXTURES');
    expect(fixturesEnabled({ NODE_ENV })).toBe(false);
  });
  it('requires explicit test opt-in', () => {
    expect(fixturesEnabled({ NODE_ENV: 'test' })).toBe(false);
    expect(fixturesEnabled({ NODE_ENV: 'test', E2E_FIXTURES: '1' })).toBe(true);
  });
  it('deployment compose excludes fixture opt-in', async () => {
    for (const file of ['docker-compose.yml', 'deploy/app/compose.yml']) {
      const text = await readFile(new URL(`../../../../${file}`, import.meta.url), 'utf8');
      expect(text).not.toMatch(/E2E_FIXTURES/);
    }
  });
});
