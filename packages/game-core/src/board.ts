import type { PlayerId } from './types.js';
import type { GameEvent } from './engine.js';
import type { GameState } from './state.js';

/**
 * PLACEHOLDER board for stage 1.
 *
 * A bare 40-cell ring with a start cell and one jail cell, so movement and the
 * interim jail rule have somewhere to happen. Stage 2 replaces it with the real
 * `CLASSIC_40` layout; nothing here is a product decision about the board.
 */

export type PlaceholderCellKind = 'start' | 'jail' | 'blank';

export interface PlaceholderCell {
  readonly index: number;
  readonly kind: PlaceholderCellKind;
}

export interface PlaceholderRing {
  /** Marks this layout as a temporary placeholder, replaced in stage 2. */
  readonly placeholder: true;
  readonly replacedInStage: 2;
  readonly size: 40;
  readonly startCell: number;
  readonly jailCell: number;
  readonly cells: readonly PlaceholderCell[];
}

const SIZE = 40;
const START_CELL = 0;
/** Placeholder jail cell; mirrors the classic layout so stage 2 changes the least. */
const JAIL_CELL = 10;

const cells: PlaceholderCell[] = [];
for (let index = 0; index < SIZE; index++) {
  const kind: PlaceholderCellKind = index === START_CELL ? 'start' : index === JAIL_CELL ? 'jail' : 'blank';
  cells.push(Object.freeze({ index, kind }));
}

/** PLACEHOLDER: the stage 1 40-cell ring. Replaced by `CLASSIC_40` in stage 2. */
export const PLACEHOLDER_RING: PlaceholderRing = Object.freeze({
  placeholder: true,
  replacedInStage: 2,
  size: SIZE,
  startCell: START_CELL,
  jailCell: JAIL_CELL,
  cells: Object.freeze(cells),
});

/** Cell reached by moving `steps` forward from `from` around the ring. */
export function advance(from: number, steps: number): number {
  return (from + steps) % PLACEHOLDER_RING.size;
}

export type PlayerMovedEvent = GameEvent<
  { readonly playerId: PlayerId; readonly from: number; readonly to: number; readonly steps: number },
  'PlayerMoved'
>;

/** Move `playerId` forward by `steps` on the ring and report it. */
export function movePlayer(
  state: GameState,
  playerId: PlayerId,
  steps: number,
): { state: GameState; event: PlayerMovedEvent } {
  const from = state.positions[playerId]!;
  const to = advance(from, steps);
  return {
    state: { ...state, positions: { ...state.positions, [playerId]: to } },
    event: { type: 'PlayerMoved', payload: { playerId, from, to, steps } },
  };
}
