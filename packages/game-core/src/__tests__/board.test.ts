import { describe, it, expect } from 'vitest';
import { CLASSIC_40, advance } from '../board.js';

// spec: engine/turn-cycle "Movement on the CLASSIC_40"
describe('CLASSIC_40', () => {
  it('is the fixed 40-cell classic layout', () => {
    expect(CLASSIC_40.size).toBe(40);
    expect(CLASSIC_40.cells).toHaveLength(40);
    CLASSIC_40.cells.forEach((c, i) => expect(c.index).toBe(i));
  });

  it('starts on cell 0 and has exactly one jail cell', () => {
    expect(CLASSIC_40.startCell).toBe(0);
    expect(CLASSIC_40.cells[0]!.kind).toBe('start');
    const jails = CLASSIC_40.cells.filter((c) => c.kind === 'jail');
    expect(jails).toHaveLength(1);
    expect(jails[0]!.index).toBe(CLASSIC_40.jailCell);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(CLASSIC_40)).toBe(true);
    expect(Object.isFrozen(CLASSIC_40.cells)).toBe(true);
  });

  it('advance wraps around the ring', () => {
    expect(advance(36, 7)).toBe(3);
    expect(advance(0, 12)).toBe(12);
    expect(advance(28, 12)).toBe(0);
  });
});
