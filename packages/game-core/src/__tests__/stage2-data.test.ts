import { describe, it, expect } from 'vitest';
import { CATALOG, validateCatalog } from '../catalog.js';
import { CLASSIC_40 } from '../board/classic40.js';
import { PRICE_TABLE } from '../board/prices.js';
import { generateBoard } from '../board/generate.js';
import { seedRng, absorbEntropy } from '../rng.js';
import { startingCapital, lapReward, creditBalance } from '../money.js';
import { checkInvariants } from '../invariants.js';
import { genesis } from '../state.js';
import { entropy, type Money } from '../types.js';
import { pid, deepFreeze } from './helpers/fixtures.js';
const names = [
  ['ПриватБанк', 'Ощадбанк', 'monobank', 'ПУМБ', 'Укргазбанк', 'Райффайзен Банк', 'Sense Bank', 'А-Банк'],
  ['ARX', 'ТАС', 'Оранта', 'Universalna', 'ІНГО', 'USG'],
  ['Moneyveo', 'CreditPlus', 'ШвидкоГроші', 'Миттєві Гроші', 'Credit7', 'Miloan'],
  ['SoftServe', 'GlobalLogic', 'Grammarly', 'MacPaw', 'Readdle', 'Ajax Systems', 'Preply', 'Genesis'],
  ['Київстар', 'Vodafone Україна', 'lifecell', 'Укртелеком', 'Datagroup-Volia'],
  ['Uklon', 'OnTaxi', 'Bolt Україна', 'Uber Україна'],
  ['Rozetka', 'Prom.ua', 'OLX Україна', 'Епіцентр', 'Comfy', 'Фокстрот'],
  ['АТБ', 'Сільпо', 'Novus', 'Varus', 'Фора'],
  ['WOG', 'ОККО', 'UPG', 'БРСМ-Нафта', 'SOCAR Україна'],
  ['Megogo', 'Sweet.tv', '1+1 Media', 'StarLightMedia'],
];
describe('stage 2 accepted data', () => {
  it('pins all proposal strings and catalog ordering', () => {
    expect(CATALOG.categories.map(c => c.name)).toEqual(['Банки', 'Страхование', 'Микрофинансы', 'Технологии', 'Связь', 'Такси и мобильность', 'E-commerce', 'Продуктовый ритейл', 'Топливо и АЗС', 'Медиа и развлечения']);
    expect(CATALOG.categories.map(c => c.companies.map(x => x.name))).toEqual(names);
    expect(CATALOG.logistics.map(c => c.name)).toEqual(['Нова пошта', 'Укрпошта', 'Meest', 'Укрзалізниця', 'Delivery', 'САТ']);
    expect(CATALOG.energy.map(c => c.name)).toEqual(['ДТЕК', 'Укренерго', 'Нафтогаз', 'Укргідроенерго']);
    expect(() => validateCatalog(CATALOG)).not.toThrow();
  });
  it.each([null, {}, { ...CATALOG, version: 'ua-2' }, { ...CATALOG, logistics: [] }, { ...CATALOG, categories: [{ ...CATALOG.categories[0], companies: [] }, ...CATALOG.categories.slice(1)] }, { ...CATALOG, energy: CATALOG.energy.map(() => CATALOG.energy[0]) }])('rejects malformed catalogs', value => expect(() => validateCatalog(value)).toThrow());
  it('pins every cell kind and monopoly rank', () => {
    const expected = ['start', 1, 'chance', 1, 'chance', 'logistics', 2, 'chance', 2, 2, 'jail', 3, 'energy', 3, 3, 'logistics', 4, 'chance', 4, 4, 'casino', 5, 'chance', 5, 5, 'logistics', 6, 6, 'energy', 6, 'go-to-jail', 7, 7, 'chance', 7, 'logistics', 'chance', 8, 'chance', 8];
    expect(CLASSIC_40.cells.map(c => c.rank ?? c.kind)).toEqual(expected);
    expect(CLASSIC_40.cells.every(Object.isFrozen)).toBe(true);
  });
  it('pins every price and total with the expensive company last by index', () => {
    expect(PRICE_TABLE.ranks).toEqual([[720, 800], [930, 930, 1030], [1210, 1210, 1330], [1560, 1560, 1720], [2020, 2020, 2220], [2610, 2610, 2870], [3370, 3370, 3710], [4360, 4800]]);
    const board = generateBoard(seedRng(7)).board;
    expect(board.cells.reduce((sum, c) => sum + (c.asset?.price ?? 0), 0)).toBe(56740);
    expect(PRICE_TABLE.S).toBe(56740);
    for (let rank = 1; rank <= 8; rank++)
      expect(board.cells.filter(c => c.asset?.rank === rank).map(c => c.asset!.price)).toEqual(PRICE_TABLE.ranks[rank - 1]);
    expect(board.cells.filter(c => c.kind === 'logistics').map(c => c.asset!.price)).toEqual([1780, 1780, 1780, 1780]);
    expect(board.cells.filter(c => c.kind === 'energy').map(c => c.asset!.price)).toEqual([1330, 1330]);
  });
  it.each([[2, 29910, 3980], [3, 19940, 2650], [4, 14950, 1990], [5, 11960, 1590], [6, 9970, 1320]])('pins money for %i players', (n, c, r) => { expect(startingCapital(n!)).toBe(c); expect(lapReward(c as Money)).toBe(r); });
  it.each(['__proto__', 'constructor', 'toString'])('credits own player key %s immutably', id => {
    const input = deepFreeze({});
    const a = creditBalance(input, pid(id), 10 as Money, 'starting-capital');
    const b = creditBalance(a.balances, pid(id), 20 as Money, 'lap-reward');
    expect(Object.keys(input)).toEqual([]);
    expect(Object.hasOwn(b.balances, id)).toBe(true);
    expect(b.balances[id]).toBe(30);
    expect(b.event.payload.balance).toBe(30);
  });
});
describe('gen-1 deterministic proof', () => {
  it('pins resolved board and final RNG with seed 42 and entropy [1,2,3,4]', () => {
    const input = deepFreeze(absorbEntropy(seedRng(42), entropy([1, 2, 3, 4])));
    const generated = generateBoard(input);
    expect(generated).toMatchSnapshot();
    expect(generateBoard(input)).toEqual(generated);
    expect(generateBoard(absorbEntropy(seedRng(43), entropy([1, 2, 3, 4]))).board).not.toEqual(generated.board);
    expect(generateBoard(absorbEntropy(seedRng(42), entropy([1, 2, 3, 5]))).board).not.toEqual(generated.board);
  });
  it('satisfies board shape and covers every category/company over 500 seeds', () => {
    const seen = new Set<string>();
    const categories = new Set<string>();
    for (let seed = 0; seed < 500; seed++) {
      const generated = generateBoard(seedRng(seed));
      checkInvariants({ ...genesis(), phase: 'lobby', rulesVersion: 'core-4', ...generated });
      for (const c of generated.board.cells)
        if (c.asset) {
          seen.add(c.asset.assetId);
          categories.add(c.asset.categoryId);
        }
    }
    expect([...CATALOG.categories.flatMap(c => c.companies), ...CATALOG.logistics, ...CATALOG.energy].every(c => seen.has(c.id))).toBe(true);
    expect(CATALOG.categories.every(c => categories.has(c.id))).toBe(true);
  });
});
