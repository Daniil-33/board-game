import type { AssetId, Money } from '../types.js';
import type { GameEvent } from '../engine.js';
import { CATALOG, type Company } from '../catalog.js';
import { nextIntInclusive, type RngState } from '../rng.js';
import { CLASSIC_40, type CellKind } from './classic40.js';
import { PRICE_TABLE, cellPrice } from './prices.js';
export interface BoardAsset {
  readonly assetId: AssetId;
  readonly name: string;
  readonly categoryId: string;
  readonly categoryName: string;
  readonly groupId: string;
  readonly rank: number | null;
  readonly price: Money;
}
export interface BoardCell {
  readonly index: number;
  readonly kind: CellKind;
  readonly asset: BoardAsset | null;
}
export interface GeneratedBoard {
  readonly layout: 'CLASSIC_40';
  readonly catalogVersion: string;
  readonly priceTableVersion: string;
  readonly generatorVersion: string;
  readonly cells: readonly BoardCell[];
}
export type BoardGenerated = GameEvent<Omit<GeneratedBoard, 'cells'>, 'BoardGenerated'>;
export type BoardGeneratedEvent = BoardGenerated;
export function generateBoard(input: RngState): {
  board: GeneratedBoard;
  rng: RngState;
} {
  let rng = input;
  function shuffle<T>(values: readonly T[]): T[] {
    const out = [...values];
    for (let i = out.length - 1; i > 0; i--) {
      let j: number;
      [j, rng] = nextIntInclusive(rng, 0, i);
      [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
  }
  const cells: BoardCell[] = CLASSIC_40.cells.map(c => ({ index: c.index, kind: c.kind, asset: null }));
  function assign(indices: readonly number[], selected: readonly Company[], categoryId: string, categoryName: string, groupId: string, rank: number | null): void {
    indices.forEach((index, position) => {
      const company = selected[position]!;
      cells[index] = { index, kind: cells[index]!.kind, asset: { assetId: company.id as AssetId, name: company.name, categoryId, categoryName, groupId, rank, price: cellPrice(cells[index]!.kind, rank, position) } };
    });
  }
  const categories = shuffle(CATALOG.categories).slice(0, 8);
  categories.forEach((category, i) => assign(CLASSIC_40.cells.filter(c => c.rank === i + 1).map(c => c.index), shuffle(category.companies), category.id, category.name, `M${i + 1}`, i + 1));
  assign([5, 15, 25, 35], shuffle(CATALOG.logistics), 'logistics', 'Логистика', 'logistics', null);
  assign([12, 28], shuffle(CATALOG.energy), 'energy', 'Энергетика', 'energy', null);
  return { board: { layout: 'CLASSIC_40', catalogVersion: CATALOG.version, priceTableVersion: PRICE_TABLE.version, generatorVersion: 'gen-1', cells }, rng };
}
