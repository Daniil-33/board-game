import { describe, it, expect } from 'vitest';
import { timestamp } from '../types.js';

describe('timestamp', () => {
  it('accepts 0', () => {
    expect(timestamp(0)).toBe(0);
  });

  it('rejects fractional milliseconds', () => {
    expect(() => timestamp(1.5)).toThrow(RangeError);
  });

  it('rejects negative values', () => {
    expect(() => timestamp(-1)).toThrow(RangeError);
  });

  it('orders numerically', () => {
    const a = timestamp(1_700_000_000_000);
    const b = timestamp(1_700_000_045_000);
    expect(a < b).toBe(true);
    expect(b - a).toBe(45_000);
  });
});
