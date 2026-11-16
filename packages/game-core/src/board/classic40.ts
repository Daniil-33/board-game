export type CellKind = 'start' | 'jail' | 'casino' | 'go-to-jail' | 'chance' | 'monopoly' | 'logistics' | 'energy';
export interface LayoutCell {
  readonly index: number;
  readonly kind: CellKind;
  readonly rank: number | null;
}
const groups = [[1, 3], [6, 8, 9], [11, 13, 14], [16, 18, 19], [21, 23, 24], [26, 27, 29], [31, 32, 34], [37, 39]];
const cells: readonly LayoutCell[] = Object.freeze(Array.from({ length: 40 }, (_, index) => {
  const rankIndex = groups.findIndex(g => g.includes(index));
  const kind: CellKind = rankIndex >= 0 ? 'monopoly' : index === 0 ? 'start' : index === 10 ? 'jail' : index === 20 ? 'casino' : index === 30 ? 'go-to-jail' : [5, 15, 25, 35].includes(index) ? 'logistics' : [12, 28].includes(index) ? 'energy' : 'chance';
  return Object.freeze({ index, kind, rank: rankIndex >= 0 ? rankIndex + 1 : null });
}));
export const CLASSIC_40 = Object.freeze({ size: 40, startCell: 0, jailCell: 10, cells } as const);
