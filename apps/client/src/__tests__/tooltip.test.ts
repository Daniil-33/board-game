import { afterEach, expect, it, vi } from 'vitest';
import type { BoardScene } from '../widgets/board/BoardCanvas';
import { mountCellTooltip } from '../widgets/board/tooltip';

type HoverDetails = { bounds: { x: number; y: number; width: number; height: number }; name: string; price: string; mortgaged: boolean };
let dispose: (() => void) | undefined;
afterEach(() => { dispose?.(); dispose = undefined; vi.restoreAllMocks(); });

it('shows the desktop asset tooltip text with and without the mortgage suffix', () => {
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
  const canvas = document.createElement('canvas');
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) });
  const scene = { size: 100, setHover: (callback: ((details: HoverDetails | null) => void) | null) => { if (callback) update = callback; } } as unknown as BoardScene;
  let update: (details: HoverDetails | null) => void = () => {};
  dispose = mountCellTooltip(canvas, scene);
  const details = { bounds: { x: 10, y: 10, width: 10, height: 10 }, name: 'Northstar', price: '1 200' };
  update({ ...details, mortgaged: false });
  const tooltip = document.querySelector('[role="tooltip"]')!;
  expect(tooltip.textContent).toBe('Northstar · 1 200');
  update({ ...details, mortgaged: true });
  expect(tooltip.textContent).toBe('Northstar · 1 200 · В залоге');
});
