import { afterEach, describe, expect, it } from 'vitest';
import { logoUrl } from '../shared/lib/logos';

afterEach(() => {
  delete window.__GAME_CONFIG__;
});

describe('logoUrl', () => {
  it('returns light and dark brand URLs by default', () => {
    expect(logoUrl('banks-1', { dark: false })).toMatch(/\/brand\/banks-1\.svg$/);
    expect(logoUrl('banks-1', { dark: true })).toMatch(/\/brand\/banks-1-dark\.svg$/);
  });

  it('selects the geometric URLs from runtime config', () => {
    window.__GAME_CONFIG__ = { logoSet: 'geometric' };
    expect(logoUrl('banks-1', { dark: false })).toMatch(/\/geometric\/banks-1\.svg$/);
    expect(logoUrl('banks-1', { dark: true })).toMatch(/\/geometric\/banks-1-dark\.svg$/);
  });

  it.each(['unknown', 'banks-1-dark', 'constructor', '../brand/banks-1'])('returns null for %s', (id) => {
    expect(logoUrl(id, { dark: false })).toBeNull();
    expect(logoUrl(id, { dark: true })).toBeNull();
  });
});
