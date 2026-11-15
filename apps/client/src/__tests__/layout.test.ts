import { describe, expect, it } from 'vitest';
import { PLACEHOLDER_RING } from '@game/game-core';
import { RING_CELLS, cellRect, jailBox, jailVisitorSlot, tokenSlot, type Rect } from '../board/layout';

const SIZE = 660;
const rects = Array.from({ length: RING_CELLS }, (_, i) => cellRect(i, SIZE));
const overlap = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width - 1e-6 && b.x < a.x + a.width - 1e-6 && a.y < b.y + b.height - 1e-6 && b.y < a.y + a.height - 1e-6;

describe('ring layout', () => {
  it('has one cell per cell of the game-core placeholder ring', () => {
    expect(RING_CELLS).toBe(PLACEHOLDER_RING.size);
    expect(rects).toHaveLength(40);
  });

  it('cells are inside the board and do not overlap', () => {
    for (const [i, a] of rects.entries()) {
      expect(a.x).toBeGreaterThanOrEqual(0);
      expect(a.y).toBeGreaterThanOrEqual(0);
      expect(a.x + a.width).toBeLessThanOrEqual(SIZE + 1e-6);
      expect(a.y + a.height).toBeLessThanOrEqual(SIZE + 1e-6);
      for (const b of rects.slice(i + 1)) expect(overlap(a, b)).toBe(false);
    }
  });

  it('corners are cells 0, 10, 20 and 30, clockwise from the bottom right', () => {
    const cell = SIZE / 11;
    expect(rects[0]).toMatchObject({ x: 10 * cell, y: 10 * cell });
    expect(rects[10]).toMatchObject({ x: 0, y: 10 * cell });
    expect(rects[20]).toMatchObject({ x: 0, y: 0 });
    expect(rects[30]).toMatchObject({ x: 10 * cell, y: 0 });
  });

  it('consecutive cells touch, so a token walks along the ring', () => {
    for (let i = 0; i < RING_CELLS; i++) {
      const a = rects[i]!;
      const b = rects[(i + 1) % RING_CELLS]!;
      expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBeCloseTo(SIZE / 11);
    }
  });

  it('rejects an index off the ring', () => {
    expect(() => cellRect(40, SIZE)).toThrow(RangeError);
    expect(() => cellRect(-1, SIZE)).toThrow(RangeError);
    expect(() => cellRect(1.5, SIZE)).toThrow(RangeError);
  });

  it('gives six distinct token slots inside a cell, the jail box and the visitor strip', () => {
    const rect = rects[10]!;
    const inside = (r: Rect, p: { x: number; y: number }): boolean =>
      p.x > r.x && p.x < r.x + r.width && p.y > r.y && p.y < r.y + r.height;
    const slots = [0, 1, 2, 3, 4, 5];
    const all = [
      ...slots.map((s) => tokenSlot(rects[5]!, s)),
      ...slots.map((s) => tokenSlot(jailBox(rect), s)),
      ...slots.map((s) => jailVisitorSlot(rect, s)),
    ];
    expect(new Set(all.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`)).size).toBe(18);
    for (const s of slots) {
      expect(inside(rects[5]!, tokenSlot(rects[5]!, s))).toBe(true);
      expect(inside(jailBox(rect), tokenSlot(jailBox(rect), s))).toBe(true);
      expect(inside(rect, jailVisitorSlot(rect, s))).toBe(true);
      expect(inside(jailBox(rect), jailVisitorSlot(rect, s))).toBe(false);
    }
  });
});
