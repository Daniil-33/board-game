import { describe, it, expect } from 'vitest';
import { Q } from '../money.js';

describe('Q — monetary quantization', () => {
  it('rounds down to nearest 10 (1259 → 1250)', () => {
    expect(Q(1259)).toBe(1250);
  });

  it('keeps exact multiple (1260 → 1260)', () => {
    expect(Q(1260)).toBe(1260);
  });

  it('Q(0) === 0', () => {
    expect(Q(0)).toBe(0);
  });

  it('rounds down (15 → 10)', () => {
    expect(Q(15)).toBe(10);
  });

  it('result has no fractional component', () => {
    expect(Number.isInteger(Q(1259))).toBe(true);
    expect(Number.isInteger(Q(7))).toBe(true);
  });
});
