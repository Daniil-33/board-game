import { formatMoney } from '../../shared/lib/index';
import { t } from '../../shared/i18n/index';
import type { BoardCell, GeneratedBoard } from '@game/game-core';

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
