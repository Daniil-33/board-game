import type { Money } from '../types.js';
export const PRICE_TABLE = Object.freeze({
  version: 'prices-1',
  ranks: Object.freeze([[720, 800], [930, 930, 1030], [1210, 1210, 1330], [1560, 1560, 1720], [2020, 2020, 2220], [2610, 2610, 2870], [3370, 3370, 3710], [4360, 4800]].map(r => Object.freeze(r))),
  logistics: 1780, energy: 1330, S: 56740,
});
export function cellPrice(kind: string, rank: number | null, position: number): Money {
  return (kind === 'monopoly' ? PRICE_TABLE.ranks[rank! - 1]![position]! : kind === 'logistics' ? PRICE_TABLE.logistics : PRICE_TABLE.energy) as Money;
}
