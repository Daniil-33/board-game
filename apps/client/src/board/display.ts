import type { BoardCell } from '@game/game-core';

export const GROUP_COLORS: Readonly<Record<string, number>> = {
  M1: 0xb88657, M2: 0x6ac5ed, M3: 0xd979bd, M4: 0xf5a742,
  M5: 0xed6464, M6: 0xe2ce50, M7: 0x65bd81, M8: 0x8583ed,
  logistics: 0xb5c1cc, energy: 0x52ddd1,
};
const SPECIAL_NAMES = { start: 'Start', jail: 'Jail', casino: 'Casino', 'go-to-jail': 'Go to jail', chance: 'Chance' };
export function cellDisplay(cell: BoardCell): { name: string; group: string | null; color: number | null; price: string | null } {
  if (cell.asset !== null) return {
    name: cell.asset.name, group: cell.asset.groupId,
    color: GROUP_COLORS[cell.asset.groupId] ?? null, price: String(cell.asset.price),
  };
  return { name: SPECIAL_NAMES[cell.kind as keyof typeof SPECIAL_NAMES] ?? '', group: null, color: null, price: null };
}
