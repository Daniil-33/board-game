import { formatMoney } from '../../shared/lib/index';
import { t } from '../../shared/i18n/index';
import type { BoardCell, GeneratedBoard } from '@game/game-core';
import type { StateView } from '@game/game-core';

const SPECIAL_NAMES = { get start() { return t('display.start'); }, get jail() { return t('display.jail'); }, get casino() { return t('display.casino'); }, get 'go-to-jail'() { return t('display.go_to_jail'); }, get chance() { return t('display.chance'); } };

export function cellDisplay(cell: BoardCell): { name: string; group: string | null; price: string | null } {
  if (cell.asset !== null) {
    return { name: cell.asset.name, group: cell.asset.groupId, price: formatMoney(cell.asset.price) };
  }
  return { name: SPECIAL_NAMES[cell.kind as keyof typeof SPECIAL_NAMES] ?? '', group: null, price: null };
}

/** Frames contain fresh objects even when the projected board is unchanged. */
export function boardDisplayKey(board: GeneratedBoard | null | undefined): string {
  return board == null ? '' : JSON.stringify(board);
}

/** Derive the canvas centre caption only from the latest public projection. */
export function boardPhaseCaption(view: StateView | null, nameOf: (playerId: string) => string): string {
  if (view === null) return '';
  if (view.phase === 'finished') return t('board_caption.finished');
  if (view.phase === 'setup') return t('board_caption.order_roll', { player: view.setup ? nameOf(view.setup.playerId) : '' });
  if (view.auction !== null) return t('board_caption.auction');
  if (view.purchase !== null) return t('board_caption.purchase');
  if (view.rent !== null) return t('board_caption.rent');
  if (view.phase === 'playing' && view.turn !== null && !view.turn.rolled) {
    return t('board_caption.regular_roll', { player: nameOf(view.turn.playerId) });
  }
  return '';
}
