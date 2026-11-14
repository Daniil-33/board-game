import { describe, it, expect } from 'vitest';
import { PLACEHOLDER_RING, advance } from '../board.js';

// spec: engine/turn-cycle "Movement on the placeholder ring"
describe('PLACEHOLDER_RING', () => {
  it('is a 40-cell ring explicitly marked as a stage 2 placeholder', () => {
    expect(PLACEHOLDER_RING.placeholder).toBe(true);
    expect(PLACEHOLDER_RING.replacedInStage).toBe(2);
    expect(PLACEHOLDER_RING.size).toBe(40);
    expect(PLACEHOLDER_RING.cells).toHaveLength(40);
    PLACEHOLDER_RING.cells.forEach((c, i) => expect(c.index).toBe(i));
  });

  it('starts on cell 0 and has exactly one jail cell', () => {
    expect(PLACEHOLDER_RING.startCell).toBe(0);
    expect(PLACEHOLDER_RING.cells[0]!.kind).toBe('start');
    const jails = PLACEHOLDER_RING.cells.filter((c) => c.kind === 'jail');
    expect(jails).toHaveLength(1);
    expect(jails[0]!.index).toBe(PLACEHOLDER_RING.jailCell);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(PLACEHOLDER_RING)).toBe(true);
    expect(Object.isFrozen(PLACEHOLDER_RING.cells)).toBe(true);
  });

  it('advance wraps around the ring', () => {
    expect(advance(36, 7)).toBe(3);
    expect(advance(0, 12)).toBe(12);
    expect(advance(28, 12)).toBe(0);
  });
});
