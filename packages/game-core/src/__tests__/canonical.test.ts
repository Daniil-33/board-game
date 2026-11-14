import { describe, it, expect } from 'vitest';
import { canonicalJson, isPlainData } from '../canonical.js';

describe('canonicalJson', () => {
  it('is independent of key order, recursively', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalJson({ a: { c: 3, d: 2 }, b: 1 }));
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it('keeps array order', () => {
    expect(canonicalJson([3, [2, 1], { z: 0, y: 1 }])).toBe('[3,[2,1],{"y":1,"z":0}]');
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });

  it('encodes primitives like JSON', () => {
    expect(canonicalJson(null)).toBe('null');
    expect(canonicalJson('a"b')).toBe('"a\\"b"');
    expect(canonicalJson(true)).toBe('true');
    expect(canonicalJson(12)).toBe('12');
  });
});

describe('isPlainData', () => {
  it('accepts JSON-compatible data', () => {
    expect(isPlainData(null)).toBe(true);
    expect(isPlainData({ a: [1, 'x', true, null, { b: 2 }] })).toBe(true);
    expect(isPlainData(Object.create(null))).toBe(true);
  });

  it.each([
    ['function', () => 1],
    ['undefined', undefined],
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['nested undefined', { a: undefined }],
    ['nested function', { a: [() => 1] }],
    ['bigint', 1n],
    ['symbol', Symbol('s')],
    ['Date', new Date(0)],
    ['Map', new Map()],
    ['sparse array', [1, , 3]],
  ])('rejects %s', (_name, v) => {
    expect(isPlainData(v)).toBe(false);
  });

  it('rejects cycles but accepts shared (non-cyclic) references', () => {
    const cyc: Record<string, unknown> = {};
    cyc.self = cyc;
    expect(isPlainData(cyc)).toBe(false);
    const shared = { x: 1 };
    expect(isPlainData({ a: shared, b: shared })).toBe(true);
  });
});
