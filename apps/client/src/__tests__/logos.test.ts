import { afterEach, describe, expect, it } from 'vitest';
import { vi } from "vitest";

vi.mock("../../../../packages/game-core/src/catalog/logos/geometric/logos.json", async (original) => {
  const { default: manifest } = await original<{ default: typeof import("../../../../packages/game-core/src/catalog/logos/geometric/logos.json") }>();
  return { default: { ...manifest, "banks-3": {} } };
});
import { logoMonogram, logoUrl } from '../shared/lib/logos';

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

describe('logoMonogram', () => {
  it.each(['brand', 'geometric'] as const)('uses the geometric monogram with %s logos', (logoSet) => {
    window.__GAME_CONFIG__ = { logoSet };
    expect(logoMonogram('banks-1')).toBe('ПБ');
  });

  it('uses catalog letters when the manifest lacks a monogram', () => {
    expect(logoMonogram('banks-3')).toBe('MO');
    expect(logoMonogram('constructor')).toBe('');
  });
});
