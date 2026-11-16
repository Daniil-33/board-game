import { describe, expect, it } from 'vitest';
import { readConfig } from '../main-config.js';

const base = { DATABASE_URL: 'postgres://localhost/game' };
describe('runtime configuration', () => {
  it('defaults to disabled policy and unknown SHA', () => {
    expect(readConfig(base)).toMatchObject({ allowedOrigins: [], gitSha: 'unknown' });
    expect(readConfig({ ...base, ALLOWED_ORIGINS: '' }).allowedOrigins).toEqual([]);
  });
  it('keeps exact origins and trims list whitespace', () => {
    expect(readConfig({ ...base, ALLOWED_ORIGINS: 'https://stage.focusima.space, http://localhost:5173', GIT_SHA: 'abc123' }))
      .toMatchObject({ allowedOrigins: ['https://stage.focusima.space', 'http://localhost:5173'], gitSha: 'abc123' });
  });
  it.each([' ', ',', 'https://a,', 'https://a/', 'https://a/path', 'ftp://a', 'https://a?q=1', 'https://a#x', 'https://u@a', 'https://a:99999', 'https://a\n.example', 'null'])('rejects invalid list %j', (value) => {
    expect(() => readConfig({ ...base, ALLOWED_ORIGINS: value })).toThrow('ALLOWED_ORIGINS');
  });
});
