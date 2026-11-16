import type { PlayerId } from './types.js';
import type { GameEvent } from './engine.js';
import type { GameState } from './state.js';
import { creditBalance, type BalanceChanged } from './money.js';
import { CLASSIC_40 } from './board/classic40.js';
export { CLASSIC_40 } from './board/classic40.js';
export type { CellKind, LayoutCell } from './board/classic40.js';
export type { GeneratedBoard, BoardCell, BoardAsset, BoardGenerated, BoardGeneratedEvent } from './board/generate.js';
/** Cell reached by moving `steps` forward from `from` around the ring. */
export function advance(from: number, steps: number): number {
  return (from + steps) % CLASSIC_40.size;
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
): { state: GameState; events: readonly (PlayerMovedEvent | BalanceChanged)[] } {
  const from = state.positions[playerId]!;
  const to = advance(from, steps);
  const moved: PlayerMovedEvent = {type: 'PlayerMoved', payload: {playerId, from, to, steps}};
  const credit = from + steps >= CLASSIC_40.size ? creditBalance(state.balances, playerId, state.economy!.lapReward, 'lap-reward') : null;
  return {
    state: { ...state, balances: credit?.balances ?? state.balances, positions: { ...state.positions, [playerId]: to } },
    events: credit ? [moved, credit.event] : [moved],
  };
}
