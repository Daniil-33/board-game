/**
 * Canvas geometry of the projected ring: a square of 11 cells per side.
 * Cell 0 (start) is the bottom-right corner; indices grow clockwise, so the
 * corners are 0, 10, 20 and 30.
 */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export const BOARD_SIZE = 660;
export const CELLS_PER_SIDE = 11;
export const RING_CELLS = (CELLS_PER_SIDE - 1) * 4;

/** Rectangle of cell `index` on a square board `boardSize` wide. */
export function cellRect(index: number, boardSize: number): Rect {
  if (!Number.isInteger(index) || index < 0 || index >= RING_CELLS) {
    throw new RangeError(`Cell index must be an integer in [0, ${RING_CELLS - 1}], got ${index}`);
  }
  const cell = boardSize / CELLS_PER_SIDE;
  const last = CELLS_PER_SIDE - 1;
  const side = Math.floor(index / last);
  const offset = index % last;
  let column: number;
  let row: number;
  if (side === 0) {
    // bottom edge, right to left
    column = last - offset;
    row = last;
  } else if (side === 1) {
    // left edge, bottom to top
    column = 0;
    row = last - offset;
  } else if (side === 2) {
    // top edge, left to right
    column = offset;
    row = 0;
  } else {
    // right edge, top to bottom
    column = last;
    row = offset;
  }
  return { x: column * cell, y: row * cell, width: cell, height: cell };
}

/** Up to six fixed token slots per cell, so tokens sharing a cell do not overlap. */
export const TOKEN_SLOTS = 6;

/** Where the token in `slot` stands inside `rect`. */
export function tokenSlot(rect: Rect, slot: number): Point {
  const s = ((slot % TOKEN_SLOTS) + TOKEN_SLOTS) % TOKEN_SLOTS;
  const column = s % 3;
  const row = Math.floor(s / 3);
  return {
    x: rect.x + rect.width * (0.2 + 0.3 * column),
    y: rect.y + rect.height * (0.38 + 0.36 * row),
  };
}

/** The inner "in jail" box of the jail cell; visitors stand outside it. */
export function jailBox(rect: Rect): Rect {
  return {
    x: rect.x + rect.width * 0.04,
    y: rect.y + rect.height * 0.04,
    width: rect.width * 0.92,
    height: rect.height * 0.44,
  };
}

/** Where a visiting (not jailed) token stands on the jail cell: along its bottom strip. */
export function jailVisitorSlot(rect: Rect, slot: number): Point {
  const s = ((slot % TOKEN_SLOTS) + TOKEN_SLOTS) % TOKEN_SLOTS;
  return { x: rect.x + rect.width * (0.12 + 0.15 * s), y: rect.y + rect.height * 0.84 };
}

/** Keep the price on the inward edge, following the four sides of the ring. */
export function cellStrip(index: number, rect: Rect): { bounds: Rect; vertical: boolean; content: Point } {
  const { x, y, width, height } = rect;
  const side = Math.floor(index / (CELLS_PER_SIDE - 1));
  const inset = 4;
  const strip = 11;
  const offset = 6;
  switch (side) {
    case 1:
      return { bounds: { x: x + width - inset - strip, y: y + inset, width: strip, height: height - 2 * inset },
        vertical: true, content: { x: x + width / 2 - offset, y: y + height / 2 } };
    case 2:
      return { bounds: { x: x + inset, y: y + height - inset - strip, width: width - 2 * inset, height: strip },
        vertical: false, content: { x: x + width / 2, y: y + height / 2 - offset } };
    case 3:
      return { bounds: { x: x + inset, y: y + inset, width: strip, height: height - 2 * inset },
        vertical: true, content: { x: x + width / 2 + offset, y: y + height / 2 } };
    default:
      return { bounds: { x: x + inset, y: y + inset, width: width - 2 * inset, height: strip },
        vertical: false, content: { x: x + width / 2, y: y + height / 2 } };
  }
}
