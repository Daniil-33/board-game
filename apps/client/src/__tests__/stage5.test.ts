import { h as render } from 'vue';
import { MyTurn } from '../widgets/my-turn/index';
import { withUi } from './helpers';
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import {
  buildLegality, mortgageAdvance, mortgageLegality, projectState, redeemLegality, saleLegality, seedRng,
  type AssetId, type AssetsReleased, type CommandId, type GameState, type LiquidationApplied, type Money, type MortgageErrorCode,
  type PlayerBankrupt, type RentPaid, type StateView, type Timestamp,
} from '@game/game-core';
import { decodeClientFrame, type ClientCommandType } from '@game/protocol';
import { App, GAME_OVER_SCREEN_OVERRIDE_KEY, GAME_SCREEN_OVERRIDE_KEY } from '../app/index';
import { GameScreen } from '../pages/game/index';
import { GameOverScreen } from '../pages/game-over/index';
import { AssetCard } from '../widgets/asset-card/index';
import { DebtNotices } from '../widgets/debt-notices/index';
import { Hud } from '../widgets/turn-header/index';
import { BoardScene } from '../widgets/board/index';
import { CLIENT_KEY, BOARD_MOUNT_KEY } from '../features/client-session/index';
import { HOUSE_REASONS, houseControls } from '../entities/game/index';
import { MORTGAGE_REASONS, mortgageControls, mortgageReason, mortgageTerms } from '../entities/game/index';
import { NOTICE_LIMIT, debtNotices, eliminationText, formatTime, type DebtNotice } from '../entities/game/index';
import type { ActionContext } from '../entities/game/index';
import { harness, pid, playingView, room, storedSession, update, welcome } from './helpers';

const nameOf = (id: string): string => ({ a: 'Alice', b: 'Bob', c: 'Carol' })[id] ?? id;
const colorOf = (): string => '#fff';
const THREE = room([['a', 'Alice'], ['b', 'Bob'], ['c', 'Carol']]);
const provide = (h: ReturnType<typeof harness>) => ({ global: { provide: {
  [CLIENT_KEY as symbol]: h.client, [BOARD_MOUNT_KEY as symbol]: h.mount,
  [GAME_SCREEN_OVERRIDE_KEY as symbol]: GameScreen, [GAME_OVER_SCREEN_OVERRIDE_KEY as symbol]: GameOverScreen,
} } });

function core(view: StateView, over: Partial<GameState> = {}): GameState {
  const { rentQuotes: _quotes, result: _result, ...fields } = view;
  return { ...fields, rng: seedRng(7), ...over };
}
const project = (state: GameState, viewer = 'a'): StateView => projectState(state, { kind: 'player', id: pid(viewer) });
const at = (s: GameState | StateView, i: number): AssetId => s.board!.cells[i]!.asset!.assetId;
const priceAt = (s: GameState | StateView, i: number): Money => s.board!.cells[i]!.asset!.price;

/** Board of seed 42: M1 = cells 1, 3; M2 = 6, 8, 9; logistics 5, 15; energy 12, 28; M3 has 11. */
function owning(): GameState {
  const v = playingView(['a', 'b', 'c'], { rolled: true, owner: 'a' });
  const owners = { ...Object.fromEntries([1, 3, 6, 8, 9, 12].map(i => [at(v, i), pid('a')])), ...Object.fromEntries([5, 15, 11, 28].map(i => [at(v, i), pid('b')])) };
  return core(v, { owners, houses: { [at(v, 6)]: 1, [at(v, 8)]: 1 } });
}
/** `owning()` with cell `cell` mortgaged; `advance` defaults to the helper's. */
function mortgaged(s: GameState, cell: number, o: { advance?: number; laps?: number; pending?: string[] } = {}): GameState {
  return { ...s, mortgages: { ...s.mortgages, [at(s, cell)]: { advance: (o.advance ?? mortgageAdvance(priceAt(s, cell))) as Money, lapsCompleted: o.laps ?? 0, pending: (o.pending ?? ['a', 'b', 'c']).map(pid) } } };
}
function withRent(s: GameState, payer = 'a'): GameState {
  return { ...s, rent: { payerId: pid(payer), ownerId: pid('b'), assetId: at(s, 5), cell: 5, kind: 'logistics', amount: 170 as Money, diceSum: null } };
}
const ctx = (view: StateView, over: Partial<ActionContext> = {}): ActionContext => ({ view, me: pid('a'), connected: true, pending: [], now: 50_000, ...over });
const card = (view: StateView, cell: number, over: Partial<ActionContext> = {}) =>
  mount(AssetCard, { props: { cell: view.board!.cells[cell]!, board: view.board!, owner: 'Someone', nameOf, ...ctx(view, over) } });

describe('mortgage controls', () => {
  it('gives the same code on a core state and on its projection for every reachable mortgage error code', () => {
    const s = owning();
    const m9 = mortgaged(s, 9);
    const cases: ['mortgage' | 'redeem', GameState, number, MortgageErrorCode | null][] = [
      ['mortgage', s, 9, null],
      ['redeem', m9, 9, null],
      ['mortgage', { ...s, phase: 'finished', turn: null, winner: pid('a') }, 9, 'PHASE_NOT_ALLOWED'],
      ['mortgage', { ...s, auction: {} as never }, 9, 'AUCTION_IN_PROGRESS'],
      ['mortgage', { ...s, turn: { ...s.turn!, playerId: pid('b') } }, 9, 'NOT_ACTIVE_PLAYER'],
      ['mortgage', { ...s, purchase: { playerId: pid('a'), cell: 13, assetId: at(s, 13) } }, 9, 'DECISION_PENDING'],
      ['redeem', withRent(m9), 9, 'RENT_PENDING'],
      ['mortgage', m9, 9, 'ALREADY_MORTGAGED'],
      ['mortgage', s, 6, 'HAS_HOUSES'],
      ['redeem', s, 9, 'NOT_MORTGAGED'],
      ['redeem', { ...m9, balances: { ...m9.balances, a: 0 as Money } }, 9, 'INSUFFICIENT_FUNDS'],
    ];
    const seen = new Set<MortgageErrorCode>();
    for (const [action, state, cell, code] of cases) {
      const helper = action === 'mortgage' ? mortgageLegality : redeemLegality;
      expect(helper(state, pid('a'), at(state, cell)), `${action} ${code}`).toBe(code);
      const controls = mortgageControls(ctx(project(state)), at(state, cell))!;
      expect(controls[action].code, `${action} ${code}`).toBe(code);
      expect(controls[action].enabled).toBe(code === null);
      if (code !== null) { expect(controls[action].reason).toBe(MORTGAGE_REASONS[code]); seen.add(code); }
    }
    // NOT_AN_ASSET and NOT_OWNER cells show no controls at all; their texts serve rejected Acks.
    expect([...seen].sort()).toEqual(Object.keys(MORTGAGE_REASONS).filter(c => c !== 'NOT_AN_ASSET' && c !== 'NOT_OWNER').sort());
    expect(mortgageControls(ctx(project(s)), at(s, 11))).toBeNull();
    expect(mortgageControls(ctx(project(s)), 'nowhere' as AssetId)).toBeNull();
    expect(mortgageControls(ctx(project(s), { me: null }), at(s, 9))).toBeNull();
  });

  it('has one distinct text per code and maps it only for Mortgage and Redeem Acks', () => {
    expect(new Set(Object.values(MORTGAGE_REASONS)).size).toBe(Object.keys(MORTGAGE_REASONS).length);
    for (const code of Object.keys(MORTGAGE_REASONS) as MortgageErrorCode[]) {
      expect(mortgageReason(code, 'Mortgage')).toBe(MORTGAGE_REASONS[code]);
      expect(mortgageReason(code, 'Redeem')).toBe(MORTGAGE_REASONS[code]);
    }
    for (const type of ['BuildHouse', 'BuyAsset', 'Bid', undefined] as const) expect(mortgageReason('INSUFFICIENT_FUNDS', type)).toBeNull();
    expect(mortgageReason('TARGET_MISMATCH', 'Mortgage')).toBeNull();
    expect(mortgageReason('toString', 'Redeem')).toBeNull();
  });

  it('labels the helper advance and the stored redemption amount, and adds connection reasons', () => {
    const s = owning();
    const free = mortgageControls(ctx(project(s)), at(s, 9))!;
    expect(free.mortgage.advance).toBe(mortgageAdvance(priceAt(s, 9)));
    expect(free.redeem.amount).toBe(mortgageAdvance(priceAt(s, 9)));
    const stored = mortgageControls(ctx(project(mortgaged(s, 9, { advance: 370 }))), at(s, 9))!;
    expect(stored.redeem).toMatchObject({ enabled: true, amount: 370 });
    const view = project(s);
    expect(mortgageControls(ctx(view, { connected: false }), at(s, 9))!.mortgage).toMatchObject({ enabled: false, code: null, reason: 'Соединение потеряно, переподключаемся…' });
    expect(mortgageControls(ctx(view, { pending: ['Mortgage'] }), at(s, 9))!.mortgage.reason).toBe('Ждём ответа сервера…');
    expect(mortgageControls(ctx(view, { now: 100_000 }), at(s, 9))!.mortgage.reason).toBe('Время хода вышло.');
    expect(mortgageControls(ctx(view, { pending: ['BuildHouse'] }), at(s, 9))!.mortgage.enabled).toBe(true);
  });

  it('keeps Mortgage and Sell available during the viewer\'s own open rent while Redeem and Build show RENT_PENDING', () => {
    const s = withRent(mortgaged(owning(), 3));
    const view = project(s);
    expect(mortgageControls(ctx(view), at(s, 9))!.mortgage.enabled).toBe(true);
    expect(houseControls(ctx(view), at(s, 6))!.sell.enabled).toBe(true);
    expect(mortgageControls(ctx(view), at(s, 3))!.redeem).toMatchObject({ enabled: false, code: 'RENT_PENDING', reason: MORTGAGE_REASONS.RENT_PENDING });
    expect(houseControls(ctx(view), at(s, 9))!.build).toMatchObject({ enabled: false, code: 'RENT_PENDING' });
    expect(saleLegality(s, pid('a'), at(s, 6))).toBeNull(); expect(buildLegality(s, pid('a'), at(s, 9))).toBe('RENT_PENDING');
  });

  it('shows GROUP_MORTGAGED on Build once a group asset is mortgaged', () => {
    const s = mortgaged(owning(), 9);
    expect(buildLegality(s, pid('a'), at(s, 6))).toBe('GROUP_MORTGAGED');
    expect(card(project(s), 6).get('[data-testid="build-reason"]').text()).toBe(HOUSE_REASONS.GROUP_MORTGAGED);
  });
});

describe('asset card: mortgage', () => {
  it('emits Mortgage and Redeem intents with the asset and nothing from a disabled control', async () => {
    const s = owning();
    const free = card(project(s), 9);
    await free.get('[data-testid="mortgage"]').trigger('click');
    await free.get('[data-testid="redeem"]').trigger('click'); // disabled: NOT_MORTGAGED
    expect(free.emitted('command')).toEqual([[{ type: 'Mortgage', payload: { assetId: at(s, 9) } }]]);
    const held = card(project(mortgaged(s, 9)), 9);
    await held.get('[data-testid="redeem"]').trigger('click');
    await held.get('[data-testid="mortgage"]').trigger('click'); // disabled: ALREADY_MORTGAGED
    expect(held.emitted('command')).toEqual([[{ type: 'Redeem', payload: { assetId: at(s, 9) } }]]);
  });

  it('shows Mortgage and Redeem with amounts on every kind of own asset and none on another player\'s', () => {
    const s = owning(); const view = project(s);
    for (const cell of [1, 9, 12]) {
      const w = card(view, cell);
      expect(w.get('[data-testid="mortgage"]').text(), `cell ${cell}`).toBe(`Заложить · +${mortgageAdvance(priceAt(s, cell))}`);
      expect(w.get('[data-testid="redeem"]').text()).toBe(`Выкупить · ${mortgageAdvance(priceAt(s, cell))}`);
      expect(w.get('[data-testid="redeem-reason"]').text()).toBe(MORTGAGE_REASONS.NOT_MORTGAGED);
      expect(w.find('[data-testid="mortgage-reason"]').exists()).toBe(false);
      expect(w.get('[data-testid="mortgage"]').attributes('disabled')).toBeUndefined();
    }
    for (const cell of [5, 11, 13]) expect(card(view, cell).find('[data-testid="mortgage-controls"]').exists(), `cell ${cell}`).toBe(false);
    expect(card(view, 9, { me: pid('b') }).find('[data-testid="mortgage-controls"]').exists()).toBe(false);
    expect(card(project(s, 'b'), 5, { me: pid('b') }).find('[data-testid="mortgage-controls"]').exists()).toBe(true);
  });

  it('shows one disabled reason per code on the card', async () => {
    const s = owning(); const w = card(project(s), 9);
    const m9 = mortgaged(s, 9);
    const states: [GameState, 'mortgage' | 'redeem', MortgageErrorCode][] = [
      [{ ...s, phase: 'finished', turn: null, winner: pid('a') }, 'mortgage', 'PHASE_NOT_ALLOWED'],
      [{ ...s, auction: {} as never }, 'mortgage', 'AUCTION_IN_PROGRESS'],
      [{ ...s, turn: { ...s.turn!, playerId: pid('b') } }, 'mortgage', 'NOT_ACTIVE_PLAYER'],
      [{ ...s, purchase: { playerId: pid('a'), cell: 13, assetId: at(s, 13) } }, 'mortgage', 'DECISION_PENDING'],
      [withRent(m9), 'redeem', 'RENT_PENDING'],
      [m9, 'mortgage', 'ALREADY_MORTGAGED'],
      [s, 'redeem', 'NOT_MORTGAGED'],
      [{ ...m9, balances: { ...m9.balances, a: 0 as Money } }, 'redeem', 'INSUFFICIENT_FUNDS'],
    ];
    for (const [state, action, code] of states) {
      await w.setProps({ view: project(state) });
      expect(w.get(`[data-testid="${action}"]`).attributes('disabled'), code).toBeDefined();
      expect(w.get(`[data-testid="${action}-reason"]`).text()).toBe(MORTGAGE_REASONS[code]);
    }
    expect(card(project(s), 6).get('[data-testid="mortgage-reason"]').text()).toBe(MORTGAGE_REASONS.HAS_HOUSES);
    expect(card(project(s), 9, { connected: false }).get('[data-testid="mortgage-reason"]').text()).toBe('Соединение потеряно, переподключаемся…');
  });

  it('shows projected terms, pending names and zero rent, and follows each view until the mortgage ends', async () => {
    const s = owning();
    const w = card(project(mortgaged(s, 9, { laps: 2, pending: ['b', 'c'] })), 9);
    expect(w.get('[data-testid="asset-mortgage"]').text()).toBe(`В залоге: получено ${mortgageAdvance(priceAt(s, 9))}, осталось 6 кругов`);
    expect(w.get('[data-testid="asset-mortgage-pending"]').text()).toBe('Bob, Carol');
    expect(w.get('[data-testid="asset-rent"]').text()).toBe('0');
    expect(w.get('[data-testid="redeem"]').text()).toBe(`Выкупить · ${mortgageAdvance(priceAt(s, 9))}`);
    await w.setProps({ view: project(mortgaged(s, 9, { laps: 7, pending: ['c'] })) });
    expect(w.get('[data-testid="asset-mortgage"]').text()).toContain('остался 1 круг');
    expect(w.get('[data-testid="asset-mortgage-pending"]').text()).toBe('Carol');
    await w.setProps({ view: project(s) });
    expect(w.find('[data-testid="asset-mortgage"]').exists()).toBe(false);
    expect(w.get('[data-testid="asset-rent"]').text()).not.toBe('0');
    // Expiry: the projection drops both the mortgage and the owner.
    const { [at(s, 9)]: _gone, ...owners } = s.owners;
    await w.setProps({ view: project({ ...s, owners }), owner: undefined });
    expect(w.find('[data-testid="asset-mortgage"]').exists()).toBe(false);
    expect(w.find('[data-testid="mortgage-controls"]').exists()).toBe(false);
    expect(w.get('[data-testid="asset-owner"]').text()).toBe('свободно');
    const energy = card(project(mortgaged(s, 12)), 12);
    expect(energy.get('[data-testid="asset-rent"]').text()).toBe('0');
    expect(energy.get('[data-testid="asset-current-rent"]').text()).toContain('0');
    expect(energy.get('[data-testid="asset-rent-table"]').findAll('tbody tr')).toHaveLength(2);
    expect(energy.find('[data-testid="rent-tier-energy-1"]').attributes('aria-current')).toBeUndefined();
    expect(energy.find('[data-testid="asset-energy"]').exists()).toBe(false);
    expect(mortgageTerms(project(s), at(s, 9))).toBeNull();
  });

  it('highlights the logistics tier from the projected rent quote when a group member is mortgaged', () => {
    const state = mortgaged(owning(), 15);
    const view = project(state);
    const w = card(view, 5);
    expect(w.get('[data-testid="rent-tier-logistics-1"]').attributes('aria-current')).toBe('true');
    expect(w.find('[data-testid="rent-tier-logistics-2"]').attributes('aria-current')).toBeUndefined();
  });
});

describe('mortgage intents', () => {
  it('sends Mortgage and Redeem with the asset to the projected turn through the protocol decoder, once while pending', () => {
    const h = harness({ stored: storedSession(THREE) });
    h.client.start(); h.sockets.last().open();
    const s = mortgaged(owning(), 3); const view = project(s); h.sockets.last().receive(welcome(view));
    h.client.sendCommand({ type: 'Mortgage', payload: { assetId: at(s, 9) } });
    h.client.sendCommand({ type: 'Redeem', payload: { assetId: at(s, 3) } });
    const target = { kind: 'target', target: { kind: 'turn', id: view.turn!.turnId } };
    expect(h.sockets.last().sent.slice(-2)).toEqual([
      { t: 'Command', commandId: 'c1', type: 'Mortgage', expected: target, payload: { assetId: at(s, 9) } },
      { t: 'Command', commandId: 'c2', type: 'Redeem', expected: target, payload: { assetId: at(s, 3) } },
    ]);
    for (const frame of h.sockets.last().sent.slice(-2)) expect(decodeClientFrame(JSON.stringify(frame)).ok).toBe(true);
    const sent = h.sockets.last().sent.length;
    h.client.sendCommand({ type: 'Mortgage', payload: { assetId: at(s, 1) } }); // Mortgage still pending
    expect(h.sockets.last().sent).toHaveLength(sent);
    expect(mortgageControls(ctx(view, { pending: h.client.game.pending.map(f => f.type) }), at(s, 1))!.mortgage.reason).toBe('Ждём ответа сервера…');
    h.client.returnToLobby();
  });

  it('shows a rejected Ack with its code, message and mortgage reason and changes nothing locally on either outcome', () => {
    const h = harness({ stored: storedSession(THREE) });
    h.client.start(); h.sockets.last().open();
    const s = owning(); const view = project(s); h.sockets.last().receive(welcome(view));
    h.client.sendCommand({ type: 'Mortgage', payload: { assetId: at(s, 6) } });
    h.sockets.last().receive({ t: 'Ack', commandId: 'c1' as CommandId, outcome: 'rejected', revision: view.revision, error: { code: 'HAS_HOUSES', message: 'HAS_HOUSES' } });
    expect(h.client.game.messages.at(-1)).toMatchObject({ code: 'HAS_HOUSES', message: 'HAS_HOUSES', commandType: 'Mortgage' });
    h.client.sendCommand({ type: 'Mortgage', payload: { assetId: at(s, 9) } });
    h.sockets.last().receive({ t: 'Ack', commandId: 'c2' as CommandId, outcome: 'accepted', revision: view.revision });
    expect(h.client.game.view!.mortgages).toEqual({}); expect(h.client.game.view!.balances).toEqual(view.balances);
    expect(h.client.game.view!.rentQuotes).toEqual(view.rentQuotes);
    h.client.sendCommand({ type: 'Redeem', payload: { assetId: at(s, 9) } });
    h.sockets.last().receive({ t: 'Ack', commandId: 'c3' as CommandId, outcome: 'rejected', revision: view.revision, error: { code: 'INSUFFICIENT_FUNDS', message: 'INSUFFICIENT_FUNDS' } });
    const base = { me: pid('a'), connected: true, pending: [] as ClientCommandType[], now: 50_000, problem: null, fatal: null, nameOf, colorOf, view };
    const texts = mount(Hud, { props: { ...base, messages: h.client.game.messages } }).findAll('[data-testid="message"]').map(m => m.text());
    expect(texts[0]).toContain(`Нельзя заложить актив — ${MORTGAGE_REASONS.HAS_HOUSES}`);
    expect(texts[1]).toContain(`Нельзя выкупить актив — ${MORTGAGE_REASONS.INSUFFICIENT_FUNDS}`);
    expect(texts[0]).not.toContain('HAS_HOUSES');
    expect(texts[1]).not.toContain('INSUFFICIENT_FUNDS');
    expect(texts[1]).not.toContain(HOUSE_REASONS.INSUFFICIENT_FUNDS);
    h.client.returnToLobby();
  });
});

const liquidation = (over: Partial<LiquidationApplied['payload']> = {}): LiquidationApplied => ({ type: 'LiquidationApplied', payload: {
  payerId: pid('a'), creditorId: pid('b'), debt: 900 as Money, cashBefore: 100 as Money, raised: 820 as Money,
  steps: [
    { tier: 1, kind: 'mortgage', assetId: 'x1' as AssetId, amount: 200 as Money },
    { tier: 2, kind: 'mortgage', assetId: 'x2' as AssetId, amount: 150 as Money },
    { tier: 3, kind: 'sell-house', assetId: 'x3' as AssetId, amount: 120 as Money },
    { tier: 3, kind: 'mortgage', assetId: 'x3' as AssetId, amount: 350 as Money },
  ], ...over } });
const rentPaid = (amount = 900): RentPaid => ({ type: 'RentPaid', payload: { payerId: pid('a'), ownerId: pid('b'), assetId: 'x9' as AssetId, amount: amount as Money, auto: true } });
const bankrupt = (over: Partial<PlayerBankrupt['payload']> = {}): PlayerBankrupt => ({ type: 'PlayerBankrupt', payload: { playerId: pid('a'), creditorId: pid('b'), debt: 900 as Money, paid: 600 as Money, writtenOff: 300 as Money, ...over } });
const releasedEvent = (reason: 'bankrupt' | 'resigned' = 'bankrupt', playerId = 'a'): AssetsReleased => ({ type: 'AssetsReleased', payload: { playerId: pid(playerId), assetIds: ['x1', 'x2'] as AssetId[], reason } });

describe('debt notices', () => {
  it('summarizes every step in event order with the event amounts and the matching payment', () => {
    const [notice, ...rest] = debtNotices([{ type: 'BalanceChanged', payload: {} }, liquidation(), { type: 'RentPaid', payload: { ...rentPaid().payload, payerId: 'c' } }, rentPaid(900)]);
    expect(rest).toEqual([]);
    expect(notice).toEqual({ kind: 'liquidation', payerId: 'a', creditorId: 'b', debt: 900, raised: 820, payment: 900, steps: liquidation().payload.steps });
    expect(debtNotices([liquidation()])[0]).toMatchObject({ payment: null });
  });

  it('adds the same update\'s bankrupt release to a bankruptcy, and nothing for a missing or other release', () => {
    expect(debtNotices([bankrupt(), releasedEvent()])).toEqual([{ kind: 'bankruptcy', playerId: 'a', creditorId: 'b', debt: 900, paid: 600, writtenOff: 300, assetIds: ['x1', 'x2'] }]);
    expect(debtNotices([releasedEvent(), bankrupt()])[0]).toMatchObject({ assetIds: ['x1', 'x2'] });
    expect(debtNotices([bankrupt()])[0]).toMatchObject({ assetIds: [] });
    expect(debtNotices([bankrupt(), releasedEvent('resigned'), releasedEvent('bankrupt', 'c')])[0]).toMatchObject({ assetIds: [] });
    expect(debtNotices([liquidation(), bankrupt()]).map(n => n.kind)).toEqual(['liquidation', 'bankruptcy']);
  });

  it('yields no notice for malformed payloads', () => {
    const bad = [
      { type: 'LiquidationApplied', payload: null },
      { type: 'LiquidationApplied', payload: [] },
      liquidation({ debt: -10 as Money }),
      liquidation({ raised: 'x' as never }),
      liquidation({ payerId: '' as never }),
      liquidation({ steps: [{ tier: 4, kind: 'mortgage', assetId: 'x', amount: 10 }] as never }),
      liquidation({ steps: [{ tier: 1, kind: 'sell', assetId: 'x', amount: 10 }] as never }),
      liquidation({ steps: [{ tier: 1, kind: 'mortgage', assetId: 'x', amount: 1.5 }] as never }),
      liquidation({ steps: null as never }),
      bankrupt({ paid: null as never }),
      bankrupt({ creditorId: 7 as never }),
      bankrupt({ playerId: undefined as never }),
    ];
    for (const event of bad) expect(debtNotices([event]), JSON.stringify(event)).toEqual([]);
    expect(debtNotices([bankrupt(), { type: 'AssetsReleased', payload: { playerId: 'a', reason: 'bankrupt', assetIds: [3] } }])[0]).toMatchObject({ assetIds: [] });
  });

  it('renders payer, creditor, debt, each step, the totals and the bankruptcy amounts with freed asset names', () => {
    const view = project(owning());
    const steps = [1, 3, 6, 9].map(i => at(view, i));
    const notices = debtNotices([liquidation({ steps: liquidation().payload.steps.map((s, i) => ({ ...s, assetId: steps[i]! })) }), rentPaid(900), bankrupt({ playerId: pid('c') }), { type: 'AssetsReleased', payload: { playerId: 'c', reason: 'bankrupt', assetIds: [at(view, 12)] } }]);
    const w = mount(DebtNotices, { props: { notices, nameOf, board: view.board } });
    expect(w.get('[data-testid="liquidation"] [data-testid="debt-notice-title"]').text()).toBe('Продажа и залог активов: Alice');
    expect(w.get('[data-testid="liquidation-debt"]').text()).toBe('Долг игроку Bob: 900.');
    const name = (i: number) => view.board!.cells[i]!.asset!.name;
    expect(w.findAll('[data-testid="liquidation-step"]').map(s => s.text())).toEqual([
      `Этап 1: заложен актив «${name(1)}», +200`, `Этап 2: заложен актив «${name(3)}», +150`, `Этап 3: продан дом на активе «${name(6)}», +120`, `Этап 3: заложен актив «${name(9)}», +350`,
    ]);
    expect(w.get('[data-testid="liquidation-total"]').text()).toBe('Собрано 820. Оплачено 900.');
    expect(w.get('[data-testid="bankruptcy"] [data-testid="debt-notice-title"]').text()).toBe('Банкротство: Carol');
    expect(w.get('[data-testid="bankruptcy-amounts"]').text()).toBe('Долг игроку Bob: 900. Оплачено 600, списано 300.');
    expect(w.get('[data-testid="bankruptcy-assets"]').text()).toBe(`Освобождены активы: ${name(12)}`);
    const empty = mount(DebtNotices, { props: { notices: debtNotices([bankrupt()]), nameOf } });
    expect(empty.get('[data-testid="bankruptcy-assets"]').text()).toBe('Освобождённых активов нет');
    expect(mount(DebtNotices, { props: { notices: [], nameOf } }).find('[data-testid="debt-notices"]').exists()).toBe(false);
  });
});

describe('debt notices in the room session', () => {
  it('keeps notices across accepted updates, ignores stale ones, bounds the list and clears it on leaving', async () => {
    const h = harness({ stored: storedSession(THREE) });
    h.client.start(); h.sockets.last().open();
    const s = owning(); const v = project(s);
    h.sockets.last().receive(welcome(v));
    const next = (n: number): StateView => ({ ...v, revision: (v.revision + n) as StateView['revision'] });
    h.sockets.last().receive(update(next(1), [liquidation(), rentPaid()]));
    h.sockets.last().receive(update(next(2), [{ type: 'TurnStarted', payload: { playerId: 'b' } }]));
    expect(h.client.game.notices.map(n => n.kind)).toEqual(['liquidation']);
    h.sockets.last().receive(update(next(2), [bankrupt()])); // stale revision: dropped
    expect(h.client.game.notices).toHaveLength(1);
    h.sockets.last().receive(welcome(next(3)));
    expect(h.client.game.notices).toHaveLength(1); // a Welcome fabricates no history
    for (let i = 0; i < NOTICE_LIMIT + 5; i++) h.sockets.last().receive(update(next(4 + i), [bankrupt({ debt: (10 * i) as Money })]));
    expect(h.client.game.notices).toHaveLength(NOTICE_LIMIT);
    expect((h.client.game.notices.at(-1) as Extract<DebtNotice, { kind: 'bankruptcy' }>).debt).toBe(10 * (NOTICE_LIMIT + 4));
    await flushPromises();
    h.client.returnToLobby();
    expect(h.client.game.notices).toEqual([]);
  });

  it('shows a terminal bankruptcy on the game-over screen even though the update cancels animations', async () => {
    const h = harness({ stored: storedSession(THREE) });
    h.client.start(); h.sockets.last().open();
    const s = owning(); h.sockets.last().receive(welcome(project(s)));
    const wrapper = mount(App, provide(h)); await flushPromises(); await new Promise((resolve) => setTimeout(resolve, 0)); await flushPromises();
    let finish!: () => void; h.board.play = () => new Promise<void>(resolve => { finish = resolve; });
    h.sockets.last().receive(update({ ...project(s), revision: (s.revision + 1) as StateView['revision'] }, [{ type: 'PlayerMoved', payload: { playerId: 'a', from: 0, to: 2, steps: 2 } }]));
    const eliminations = [{ playerId: pid('c'), reason: 'resigned' as const, at: 1_000 as Timestamp, creditorId: null }, { playerId: pid('a'), reason: 'bankrupt' as const, at: 2_000 as Timestamp, creditorId: pid('b') }];
    const finished = project({ ...s, revision: (s.revision + 2) as GameState['revision'], phase: 'finished', turn: null, winner: pid('b'), eliminated: [pid('c'), pid('a')], eliminations, finishedAt: 2_000 as Timestamp, order: [pid('b')] });
    h.sockets.last().receive(update(finished, [bankrupt(), releasedEvent(), { type: 'GameEnded', payload: { winner: 'b' } }]));
    await flushPromises(); finish(); await flushPromises();
    expect(wrapper.attributes('data-screen')).toBe('finished');
    expect(document.querySelector('[data-testid="bankruptcy-amounts"]')?.textContent).toBe('Долг игроку Bob: 900. Оплачено 600, списано 300.');
    expect(document.querySelector('[data-testid="spectator"]')?.textContent).toBe('Вы выбыли из-за банкротства.');
    wrapper.unmount(); h.client.returnToLobby();
  });
});

describe('elimination and game over', () => {
  const finishedState = (): GameState => {
    const s = owning();
    const eliminations = [{ playerId: pid('c'), reason: 'resigned' as const, at: 1_000 as Timestamp, creditorId: null }, { playerId: pid('a'), reason: 'bankrupt' as const, at: 61_000 as Timestamp, creditorId: pid('b') }];
    return { ...s, phase: 'finished', turn: null, winner: pid('b'), eliminated: [pid('c'), pid('a')], eliminations, finishedAt: 61_000 as Timestamp, order: [pid('b')],
      balances: { a: 0 as Money, b: 4200 as Money, c: 0 as Money } };
  };

  it('tells the eliminated viewer the projected reason and keeps gameplay controls disabled', () => {
    const s = owning();
    for (const reason of ['resigned', 'bankrupt'] as const) {
      const view = project({ ...s, turn: { ...s.turn!, playerId: pid('b') }, order: [pid('b'), pid('c')], eliminated: [pid('a')], eliminations: [{ playerId: pid('a'), reason, at: 5 as Timestamp, creditorId: reason === 'bankrupt' ? pid('b') : null }] });
      const w = mount(withUi(() => render(MyTurn, { context: ctx(view) })));
      expect(w.get('[data-testid="spectator"]').text()).toBe(reason === 'bankrupt' ? 'Вы обанкротились и теперь наблюдаете за партией.' : 'Вы сдались и теперь наблюдаете за партией.');
      expect(w.get('[data-testid="spectator"]').text()).toContain(reason === 'bankrupt' ? 'обанкротились' : 'сдались');
      for (const type of ['RollDice', 'EndTurn']) expect(w.get(`[data-testid="${type}"]`).attributes('disabled'), type).toBeDefined();
      expect(mortgageControls(ctx(view), at(s, 9))?.mortgage.enabled ?? false).toBe(false);
    }
  });

  it('keeps the eliminated viewer on the live game with chat after dismissing the elimination sheet', async () => {
    const s = owning();
    const view = project({ ...s, balances: { ...s.balances, [pid('a')]: 0 as Money }, order: [pid('b'), pid('c')], eliminated: [pid('a')], purchase: { playerId: pid('b'), cell: 13, assetId: at(s, 13) }, eliminations: [{ playerId: pid('a'), reason: 'resigned', at: 5 as Timestamp, creditorId: null }] });
    const h = harness({ stored: storedSession(THREE) }); h.client.start(); h.sockets.last().open(); h.sockets.last().receive(welcome(view));
    const wrapper = mount(App, { ...provide(h), attachTo: document.body }); await flushPromises(); await new Promise((resolve) => setTimeout(resolve, 0)); await flushPromises();
    expect(document.querySelector('[data-testid="elimination-screen"]')?.textContent).toContain('Вы выбыли: вы сдались');
    expect(document.querySelector('[data-testid="elimination-balance"]')?.textContent).toBe('Баланс: 0');
    expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-modal')).toBe('true');
    document.querySelector<HTMLElement>('[data-testid="continue-watching"]')!.click(); await flushPromises();
    expect(wrapper.attributes('data-screen')).toBe('game');
    expect(wrapper.find('[data-testid="chat-input"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="spectator"]').exists()).toBe(true);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.querySelector('[data-testid="purchase-status"]')?.textContent).toContain('Bob');
    const chat = wrapper.get('[data-testid="chat-input"]');
    (chat.element as HTMLInputElement).focus();
    await chat.setValue('still here');
    expect((chat.element as HTMLInputElement).value).toBe('still here');
    wrapper.unmount();
  });

  it('opens asset inspection from My Assets and restores focus to the portfolio opener on Escape', async () => {
    const view = project(owning());
    const h = harness({ stored: storedSession(THREE) }); h.client.start(); h.sockets.last().open(); h.sockets.last().receive(welcome(view));
    const wrapper = mount(App, { ...provide(h), attachTo: document.body }); await flushPromises(); await new Promise((resolve) => setTimeout(resolve, 0)); await flushPromises();
    const opener = wrapper.get('[data-testid="owned-asset-inspect"]');
    (opener.element as HTMLElement).focus(); await opener.trigger('click'); await flushPromises();
    expect(document.querySelector('[data-testid="asset-rent-table"]')).toBeTruthy();
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await flushPromises();
    expect(document.querySelector('[data-testid="asset-card"]')).toBeNull();
    expect(document.activeElement).toBe(opener.element);
    wrapper.unmount();
  });

  it('renders the result from the view, survives a reload without events and shows no game controls', async () => {
    const view = project(finishedState());
    expect(view.result).not.toBeNull();
    for (const remount of [false, true]) {
      const h = harness({ stored: storedSession(THREE) });
      h.client.start(); h.sockets.last().open(); h.sockets.last().receive(welcome(view));
      const wrapper = mount(App, provide(h)); await flushPromises(); await new Promise((resolve) => setTimeout(resolve, 0)); await flushPromises();
      if (remount) { wrapper.unmount(); }
      const w = remount ? mount(App, provide(h)) : wrapper; await flushPromises(); await new Promise((resolve) => setTimeout(resolve, 0)); await flushPromises();
      expect(w.attributes('data-screen')).toBe('finished');
      const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
      expect(dialog.getAttribute('aria-modal')).toBe('true');
      expect(dialog.querySelector('[data-testid="game-over-title"]')?.textContent).toBe('Партия окончена');
      dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      expect(document.querySelector('[role="dialog"]')).toBeTruthy();
      expect(document.querySelector('[data-testid="winner"]')?.textContent).toBe('Победитель: Bob');
      expect(document.querySelector('[data-testid="finished-at"]')?.textContent).toBe(`Время завершения: ${formatTime(61_000)}`);
      const rows = [...document.querySelectorAll<HTMLElement>('[data-testid="elimination-row"]')];
      expect(rows).toHaveLength(3);
      expect(rows.map(row => row.querySelector('.place')?.textContent)).toEqual(['1', '2', '3']);
      expect(rows[0]?.dataset.playerId).toBe('b');
      expect(rows[0]?.querySelector('[data-testid="elimination-entry"]')?.textContent).toBe('Победитель');
      expect(rows[1]?.dataset.playerId).toBe('a');
      expect(rows[1]?.querySelector('[data-testid="elimination-entry"]')?.textContent).toBe(`банкротство · ${formatTime(61_000)}`);
      expect(rows[2]?.dataset.playerId).toBe('c');
      expect(rows[2]?.querySelector('[data-testid="elimination-entry"]')?.textContent).toBe(`сдача · ${formatTime(1_000)}`);
      expect(document.querySelector('[data-testid="final-balance-row"]')).toBeNull();
      expect(document.querySelector('[data-testid="spectator"]')?.textContent).toBe('Вы выбыли из-за банкротства.');
      for (const sel of ['RollDice', 'EndTurn', 'Resign', 'mortgage', 'redeem', 'build-house', 'pay-rent']) expect(w.find(`[data-testid="${sel}"]`).exists(), sel).toBe(false);
      expect(document.querySelector('[data-testid="return-lobby"]')).toBeTruthy();
      expect(document.querySelector('[data-testid="debt-notices"]')).toBeNull();
      w.unmount(); h.client.returnToLobby();
    }
    expect(formatTime(0)).toBe('01.01.1970, 00:00:00 UTC');
  });
});

describe('mortgage markers', () => {
  it('refreshes the desktop hover mortgage suffix while the pointer remains on the asset cell', () => {
    const state = owning(), view = project(state), cell = 9;
    const scene = new BoardScene(); scene.snap(view, 'a');
    const states: boolean[] = [];
    scene.setHover(details => { if (details) states.push(details.mortgaged); });
    scene.cells.children[cell]!.emit('pointerenter', { pointerType: 'mouse' } as never);
    expect(states).toEqual([false]);
    scene.refreshOwnership(project(mortgaged(state, cell)));
    expect(states).toEqual([false, true]);
    scene.refreshOwnership(view);
    expect(states).toEqual([false, true, false]);
  });
  it('adds and removes one marker per mortgaged cell from each view, keeping cells, owners and houses, also during movement', async () => {
    const s = owning(); const scene = new BoardScene(); scene.snap(project(s), 'a');
    const first = scene.cells.children[0];
    const labels = (): string[] => scene.mortgages.children.map(c => c.label);
    expect(labels()).toEqual([]);
    scene.refreshOwnership(project(mortgaged(mortgaged(s, 9), 12)));
    expect(labels()).toEqual(['mortgage-9', 'mortgage-12']);
    expect(scene.housing.children.map(c => c.label)).toEqual(['house-6-1', 'house-8-1']);
    expect(scene.ownership.children.some(c => c.label === 'owner-9-a')).toBe(true);
    scene.refreshOwnership(project(mortgaged(s, 12)));
    expect(labels()).toEqual(['mortgage-12']);
    expect(scene.cells.children[0]).toBe(first);

    const h = harness({ stored: storedSession(THREE) });
    const refreshed: StateView[] = []; h.board.refreshOwnership = (view) => void refreshed.push(view as StateView);
    h.client.start(); h.sockets.last().open(); h.sockets.last().receive(welcome(project(s))); h.client.attachBoard(h.board);
    let finish!: () => void; h.board.play = () => new Promise<void>(resolve => { finish = resolve; });
    const next = { ...project(mortgaged(s, 9)), revision: (s.revision + 1) as StateView['revision'] };
    h.sockets.last().receive(update(next, [{ type: 'PlayerMoved', payload: { playerId: 'a', from: 0, to: 2, steps: 2 } }]));
    expect(Object.keys(refreshed.at(-1)!.mortgages)).toEqual([at(s, 9)]);
    finish(); await flushPromises(); h.client.returnToLobby();
  });
});
