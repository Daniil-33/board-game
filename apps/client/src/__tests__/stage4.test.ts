import { mount, flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import {
  buildLegality, saleLegality, energyRentFor, houseCost, houseRefund, projectState, seedRng,
  type AssetId, type CommandId, type GameState, type HouseErrorCode, type Money, type StateView,
} from '@game/game-core';
import { decodeClientFrame, type ClientCommandType } from '@game/protocol';
import { RentPanel } from '../widgets/rent-panel/index';
import { AssetCard } from '../widgets/asset-card/index';
import { Hud } from '../widgets/turn-header/index';
import { BoardScene } from '../widgets/board/index';
import { HOUSE_REASONS, houseControls, houseReason } from '../entities/game/index';
import { stepsForEvent, stepsForEvents } from '../entities/game/index';
import { actionAvailability, canIssue, type ActionContext } from '../entities/game/index';
import { harness, pid, playingView, room, storedSession, update, welcome } from './helpers';

const nameOf = (id: string): string => ({ a: 'Alice', b: 'Bob', c: 'Carol' })[id] ?? id;
const colorOf = (): string => '#fff';

/** A core state: the view's fields plus an rng, so game-core helpers and projections run on real state. */
function core(view: StateView, over: Partial<GameState> = {}): GameState {
  const { rentQuotes: _quotes, ...fields } = view;
  return { ...fields, rng: seedRng(7), ...over };
}
const project = (state: GameState): StateView => projectState(state, { kind: 'player', id: pid('a') });

/** Board of seed 42: M1 = cells 1, 3; M2 = 6, 8, 9; logistics 5, 15; energy 12, 28; M3 has 11. */
function owning(o: { rolled?: boolean; owner?: string } = {}): GameState {
  const v = playingView(['a', 'b', 'c'], { rolled: o.rolled ?? true, owner: o.owner ?? 'a' });
  const at = (i: number): AssetId => v.board!.cells[i]!.asset!.assetId;
  const owners = { ...Object.fromEntries([1, 3, 6, 8, 9, 12].map(i => [at(i), pid('a')])), ...Object.fromEntries([5, 15, 11, 28].map(i => [at(i), pid('b')])) };
  return core(v, { owners, houses: { [at(6)]: 1, [at(8)]: 1 } });
}
const at = (s: GameState | StateView, i: number): AssetId => s.board!.cells[i]!.asset!.assetId;
const ctx = (view: StateView, over: Partial<ActionContext> = {}): ActionContext => ({ view, me: pid('a'), connected: true, pending: [], now: 50_000, ...over });
function withRent(s: GameState, payer = 'a', owner = 'b', cell = 5, kind: 'regular' | 'logistics' | 'energy' = 'logistics', diceSum: number | null = null): GameState {
  return { ...s, rent: { payerId: pid(payer), ownerId: pid(owner), assetId: at(s, cell), cell, kind, amount: 170 as Money, diceSum } };
}

describe('house legality adapter', () => {
  it('gives the same code on a core state and on its projection for every house error code', () => {
    const s = owning();
    const build: [GameState, number, HouseErrorCode | null][] = [
      [s, 9, null],
      [{ ...s, phase: 'finished', turn: null, winner: pid('a') }, 9, 'PHASE_NOT_ALLOWED'],
      [{ ...s, auction: {} as never }, 9, 'AUCTION_IN_PROGRESS'],
      [{ ...s, turn: { ...s.turn!, playerId: pid('b') } }, 9, 'NOT_ACTIVE_PLAYER'],
      [{ ...s, purchase: { playerId: pid('a'), cell: 13, assetId: at(s, 13) } }, 9, 'DECISION_PENDING'],
      [withRent(s), 9, 'RENT_PENDING'],
      [s, 5, 'NOT_A_BUILDABLE_ASSET'],
      [s, 11, 'NOT_OWNER'],
      [{ ...s, owners: { ...s.owners, [at(s, 9)]: pid('b') }, houses: {} }, 6, 'GROUP_INCOMPLETE'],
      [{ ...s, houses: { [at(s, 6)]: 4, [at(s, 8)]: 4, [at(s, 9)]: 4 } }, 9, 'MAX_HOUSES'],
      [s, 6, 'UNEVEN_BUILD'],
      [{ ...s, turn: { ...s.turn!, quotas: { builds: 0, offers: 2 } } }, 9, 'BUILD_QUOTA_USED'],
      [{ ...s, balances: { ...s.balances, a: 0 as Money } }, 9, 'INSUFFICIENT_FUNDS'],
    ];
    const sale: [GameState, number, HouseErrorCode | null][] = [
      [s, 6, null], [s, 9, 'NO_HOUSES'], [{ ...s, houses: { [at(s, 6)]: 1, [at(s, 8)]: 2, [at(s, 9)]: 1 } }, 6, 'UNEVEN_SALE'],
    ];
    const seen = new Set<HouseErrorCode | null>();
    for (const [state, cell, code] of build) {
      expect(buildLegality(state, pid('a'), at(state, cell)), `build ${code}`).toBe(code);
      const controls = houseControls(ctx(project(state)), at(state, cell));
      if (controls !== null) { expect(controls.build.code, `build ${code}`).toBe(code); seen.add(code); }
    }
    for (const [state, cell, code] of sale) {
      expect(saleLegality(state, pid('a'), at(state, cell))).toBe(code);
      expect(houseControls(ctx(project(state)), at(state, cell))!.sell.code).toBe(code); seen.add(code);
    }
    // NOT_A_BUILDABLE_ASSET and NOT_OWNER assets show no controls at all; GROUP_MORTGAGED is covered in
    // stage5.test.ts. Every other code reaches a control.
    const unreachable = ['NOT_A_BUILDABLE_ASSET', 'NOT_OWNER', 'GROUP_MORTGAGED'];
    expect([...seen].filter(c => c !== null).sort()).toEqual(Object.keys(HOUSE_REASONS).filter(c => !unreachable.includes(c)).sort());
    expect(houseControls(ctx(project(s)), at(s, 5))).toBeNull();
    expect(houseControls(ctx(project(s)), at(s, 11))).toBeNull();
    expect(houseControls(ctx(project(s), { me: null }), at(s, 9))).toBeNull();
  });

  it('labels cost and refund with the game-core helpers and adds connection reasons', () => {
    const view = project(owning());
    const price = view.board!.cells[9]!.asset!.price;
    const controls = houseControls(ctx(view), at(view, 9))!;
    expect(controls.build).toMatchObject({ enabled: true, reason: null, cost: houseCost(price) });
    expect(controls.sell).toMatchObject({ enabled: false, code: 'NO_HOUSES', refund: houseRefund(houseCost(price)) });
    expect(houseControls(ctx(view, { connected: false }), at(view, 9))!.build).toMatchObject({ enabled: false, code: null, reason: 'Соединение потеряно, переподключаемся…' });
    expect(houseControls(ctx(view, { pending: ['BuildHouse'] }), at(view, 9))!.build.reason).toBe('Ждём ответа сервера…');
    expect(houseControls(ctx(view, { now: 100_000 }), at(view, 9))!.build.reason).toBe('Время хода вышло.');
    expect(houseControls(ctx(view, { pending: ['BuildHouse'] }), at(view, 6))!.sell).toMatchObject({ enabled: true });
    expect(houseReason('UNEVEN_BUILD', 'BuildHouse')).toBe(HOUSE_REASONS.UNEVEN_BUILD);
    expect(houseReason('NO_HOUSES', 'SellHouse')).toBe(HOUSE_REASONS.NO_HOUSES);
    expect(houseReason('TARGET_MISMATCH', 'BuildHouse')).toBeNull();
    expect(houseReason('toString', 'BuildHouse')).toBeNull();
    for (const type of ['BuyAsset', 'Bid', 'RollDice', 'PayRent', undefined] as const) expect(houseReason('INSUFFICIENT_FUNDS', type)).toBeNull();
    expect(new Set(Object.values(HOUSE_REASONS)).size).toBe(Object.keys(HOUSE_REASONS).length);
  });
});

describe('rent settlement', () => {
  const props = (view: StateView, over: Partial<ActionContext> = {}) => ({ ...ctx(view, over), view, nameOf });
  it('offers Pay rent with amount and owner only to the payer and shows the line to everyone', async () => {
    const view = project(withRent(owning()));
    const w = mount(RentPanel, { props: props(view) });
    expect(w.get('[data-testid="rent-line"]').text()).toBe(`Alice должен игроку Bob 170 за «${view.board!.cells[5]!.asset!.name}».`);
    expect(w.get('[data-testid="pay-rent"]').text()).toBe('Оплатить ренту 170 игроку Bob');
    await w.get('[data-testid="pay-rent"]').trigger('click'); expect(w.emitted('command')).toEqual([['PayRent']]);
    for (const me of [pid('b'), pid('c'), null]) {
      await w.setProps({ me }); expect(w.find('[data-testid="pay-rent"]').exists()).toBe(false); expect(w.find('[data-testid="rent-line"]').exists()).toBe(true);
    }
    await w.setProps({ me: pid('a'), view: { ...view, eliminated: [pid('a')] } }); expect(w.find('[data-testid="pay-rent"]').exists()).toBe(false);
  });
  it('disables Pay rent while disconnected, pending or expired, and shows an energy dice sum', async () => {
    const view = project(withRent(owning()));
    expect(canIssue(ctx(view), 'PayRent')).toBe(true);
    for (const over of [{ connected: false }, { pending: ['PayRent'] as ClientCommandType[] }, { now: 100_000 }]) {
      const w = mount(RentPanel, { props: props(view, over) }); expect(w.get('[data-testid="pay-rent"]').attributes('disabled')).toBeDefined();
    }
    const energy = project(withRent(owning(), 'a', 'b', 28, 'energy', 9));
    expect(mount(RentPanel, { props: props(energy) }).get('[data-testid="rent-line"]').text()).toContain('(сумма костей 9)');
  });
  it('keeps EndTurn enabled with an open settlement and tells the payer it pays automatically', async () => {
    const view = project(withRent(owning()));
    expect(actionAvailability(ctx(view))).toMatchObject({ EndTurn: true, PayRent: true, RollDice: false });
    const base = { me: pid('a'), connected: true, pending: [] as ClientCommandType[], now: 50_000, messages: [], problem: null, fatal: null, nameOf, colorOf };
    const w = mount(Hud, { props: { ...base, view } });
    expect(w.get('[data-testid="EndTurn"]').attributes('disabled')).toBeUndefined();
    expect(w.get('[data-testid="auto-pay-note"]').text()).toBe('При завершении хода рента будет оплачена автоматически.');
    await w.setProps({ me: pid('b') }); expect(w.find('[data-testid="auto-pay-note"]').exists()).toBe(false);
    await w.setProps({ me: pid('a'), view: project(owning()) }); expect(w.find('[data-testid="auto-pay-note"]').exists()).toBe(false);
  });
});

describe('asset card: houses, quotes and controls', () => {
  const card = (view: StateView, cell: number, over: Partial<ActionContext> = {}) =>
    mount(AssetCard, { props: { cell: view.board!.cells[cell]!, board: view.board!, owner: 'Someone', ...ctx(view, over) } });
  it('shows fixed regular and logistics quotes and an energy formula with helper examples', () => {
    const view = project(owning());
    const regular = card(view, 1);
    expect(regular.get('[data-testid="asset-houses"]').text()).toBe('0 / 4');
    expect(regular.get('[data-testid="asset-rent"]').text()).toBe(String((view.rentQuotes[at(view, 1)] as { amount: number }).amount));
    const logistics = card(view, 5);
    expect(logistics.find('[data-testid="asset-houses"]').exists()).toBe(false);
    expect(logistics.get('[data-testid="asset-rent"]').text()).toBe(String((view.rentQuotes[at(view, 5)] as { amount: number }).amount));
    expect(logistics.find('[data-testid="house-controls"]').exists()).toBe(false);
    const quote = view.rentQuotes[at(view, 12)]!;
    if (quote.kind !== 'energy') throw new Error('energy quote expected');
    const energy = card(view, 12);
    expect(energy.get('[data-testid="asset-energy"]').text()).toContain(`Рента = Q(2\u202F660 × сумма костей × ${quote.holdings} / (200 × ${quote.groupSize}))`);
    expect(energy.get('[data-testid="energy-examples"]').text()).toBe(`Сумма костей 2: ${energyRentFor(quote, 2)}, Сумма костей 7: ${energyRentFor(quote, 7)}, Сумма костей 12: ${energyRentFor(quote, 12)}`);
    expect(energy.find('[data-testid="asset-rent"]').exists()).toBe(false);
    expect(card(view, 13).find('[data-testid="asset-rent"]').exists()).toBe(false); // free asset: no quote
    const settled = project(withRent(owning({ owner: 'b' }), 'b', 'a', 12, 'energy', 9));
    expect(card(settled, 12).get('[data-testid="asset-settlement"]').text()).toBe('Рента к оплате: 170 (сумма костей 9)');
  });
  it('follows new views on an open card: houses and quote', async () => {
    const s = owning(); const w = card(project(s), 6);
    expect(w.get('[data-testid="asset-houses"]').text()).toBe('1 / 4');
    const next = project({ ...s, houses: { [at(s, 6)]: 2, [at(s, 8)]: 1, [at(s, 9)]: 1 } });
    await w.setProps({ view: next });
    expect(w.get('[data-testid="asset-houses"]').text()).toBe('2 / 4');
    expect(w.get('[data-testid="asset-rent"]').text()).toBe(String((next.rentQuotes[at(s, 6)] as { amount: number }).amount));
  });
  it('shows Build and Sell with cost, refund, quota and one reason per code, and emits the asset intent', async () => {
    const view = project(owning()); const price = view.board!.cells[9]!.asset!.price;
    const w = card(view, 9);
    expect(w.get('[data-testid="build-house"]').text()).toBe(`Построить · ${houseCost(price)}`);
    expect(w.get('[data-testid="sell-house"]').text()).toBe(`Продать дом · +${houseRefund(houseCost(price))}`);
    expect(w.get('[data-testid="builds-left"]').text()).toBe('Можно построить в этом ходу: 1');
    expect(w.find('[data-testid="build-reason"]').exists()).toBe(false);
    expect(w.get('[data-testid="sell-reason"]').text()).toBe(HOUSE_REASONS.NO_HOUSES);
    await w.get('[data-testid="build-house"]').trigger('click');
    expect(w.emitted('command')).toEqual([[{ type: 'BuildHouse', payload: { assetId: at(view, 9) } }]]);
    await w.get('[data-testid="sell-house"]').trigger('click'); expect(w.emitted('command')).toHaveLength(1); // disabled
    const s = owning();
    const states: [GameState, HouseErrorCode][] = [
      [{ ...s, auction: {} as never }, 'AUCTION_IN_PROGRESS'], [{ ...s, turn: { ...s.turn!, playerId: pid('b') } }, 'NOT_ACTIVE_PLAYER'],
      [{ ...s, purchase: { playerId: pid('a'), cell: 13, assetId: at(s, 13) } }, 'DECISION_PENDING'], [withRent(s), 'RENT_PENDING'],
      [{ ...s, houses: { [at(s, 6)]: 4, [at(s, 8)]: 4, [at(s, 9)]: 4 } }, 'MAX_HOUSES'],
      [{ ...s, turn: { ...s.turn!, quotas: { builds: 0, offers: 2 } } }, 'BUILD_QUOTA_USED'], [{ ...s, balances: { ...s.balances, a: 0 as Money } }, 'INSUFFICIENT_FUNDS'],
      [{ ...s, phase: 'finished', turn: null, winner: pid('a') }, 'PHASE_NOT_ALLOWED'],
    ];
    for (const [state, code] of states) {
      await w.setProps({ view: project(state) });
      expect(w.get('[data-testid="build-house"]').attributes('disabled'), code).toBeDefined();
      expect(w.get('[data-testid="build-reason"]').text()).toBe(HOUSE_REASONS[code]);
    }
    const uneven = card(project(s), 6); expect(uneven.get('[data-testid="build-reason"]').text()).toBe(HOUSE_REASONS.UNEVEN_BUILD);
    const incomplete = { ...s, owners: { ...s.owners, [at(s, 9)]: pid('b') }, houses: {} };
    expect(card(project(incomplete), 6).get('[data-testid="build-reason"]').text()).toBe(HOUSE_REASONS.GROUP_INCOMPLETE);
    expect(card(project({ ...s, houses: { [at(s, 6)]: 1, [at(s, 8)]: 2, [at(s, 9)]: 1 } }), 6).get('[data-testid="sell-reason"]').text()).toBe(HOUSE_REASONS.UNEVEN_SALE);
    const offline = card(view, 9, { connected: false });
    expect(offline.get('[data-testid="build-reason"]').text()).toBe('Соединение потеряно, переподключаемся…');
  });
  it('shows no controls on another player\'s or a non-monopoly asset', () => {
    const view = project(owning());
    for (const cell of [11, 5, 12, 13]) expect(card(view, cell).find('[data-testid="house-controls"]').exists(), `cell ${cell}`).toBe(false);
    expect(card(view, 9, { me: pid('b') }).find('[data-testid="house-controls"]').exists()).toBe(false);
  });
});

describe('house markers', () => {
  it('draws 0-4 markers per cell from the view without regenerating cells, also during movement', async () => {
    const s = owning(); const scene = new BoardScene(); const v = project(s);
    scene.snap(v, 'a'); const first = scene.cells.children[0];
    const labels = (): string[] => scene.housing.children.map(c => c.label);
    expect(labels()).toEqual(['house-6-1', 'house-8-1']);
    for (const n of [0, 2, 3, 4]) {
      scene.refreshOwnership(project({ ...s, houses: n === 0 ? {} : { [at(s, 6)]: n, [at(s, 8)]: n, [at(s, 9)]: n } }));
      expect(labels().filter(l => l.startsWith('house-9-'))).toHaveLength(n);
    }
    expect(scene.cells.children[0]).toBe(first);
    const h = harness({ stored: storedSession(room([['a', 'Alice'], ['b', 'Bob']])) });
    const refreshed: StateView[] = []; h.board.refreshOwnership = (view) => void refreshed.push(view as StateView);
    h.client.start(); h.sockets.last().open(); h.sockets.last().receive(welcome(v)); h.client.attachBoard(h.board);
    let finish!: () => void; h.board.play = () => new Promise<void>(resolve => { finish = resolve; });
    const built = { ...project({ ...s, houses: { ...s.houses, [at(s, 9)]: 1 } }), revision: (v.revision + 1) as StateView['revision'] };
    h.sockets.last().receive(update(built, [{ type: 'PlayerMoved', payload: { playerId: 'a', from: 0, to: 2, steps: 2 } }]));
    expect(refreshed.at(-1)!.houses).toEqual(built.houses); finish(); await flushPromises(); h.client.returnToLobby();
  });
});

describe('rent payment animation', () => {
  const paid = (over: Record<string, unknown> = {}) => ({ type: 'RentPaid', payload: { payerId: 'a', ownerId: 'b', assetId: 'x', amount: 120, auto: false, ...over } });
  it('maps a paid RentPaid to one step in event order and nothing for zero or malformed payloads', () => {
    expect(stepsForEvent(paid(), 40)).toEqual([{ kind: 'rentPayment', from: 'a', to: 'b', amount: 120 }]);
    expect(stepsForEvent(paid({ amount: 0 }), 40)).toEqual([]);
    for (const bad of [{ amount: '120' }, { amount: 1.5 }, { payerId: 3 }, { ownerId: null }, { amount: -10 }]) expect(stepsForEvent(paid(bad), 40)).toEqual([]);
    expect(stepsForEvent({ type: 'RentPaid', payload: null }, 40)).toEqual([]);
    expect(stepsForEvents([{ type: 'RentDue', payload: {} }, paid(), { type: 'TurnStarted', payload: { playerId: 'b' } }], 40))
      .toEqual([{ kind: 'rentPayment', from: 'a', to: 'b', amount: 120 }, { kind: 'highlight', playerId: 'b' }]);
  });
  it('animates only a RentPaid of a new Update, never on Welcome (reload)', async () => {
    const h = harness({ stored: storedSession(room([['a', 'Alice'], ['b', 'Bob']])) });
    h.client.start(); h.sockets.last().open();
    const open = project(withRent(owning())); h.sockets.last().receive(welcome(open)); h.client.attachBoard(h.board);
    const settled = { ...project(owning()), revision: (open.revision + 1) as StateView['revision'] };
    h.sockets.last().receive(update(settled, [paid({ amount: 170 })])); await flushPromises();
    expect(h.board.steps).toEqual([{ kind: 'rentPayment', from: 'a', to: 'b', amount: 170 }]);
    h.sockets.last().receive(welcome(settled)); await flushPromises();
    expect(h.board.steps).toHaveLength(1);
    h.client.returnToLobby();
  });
  it('plays the step on the scene and removes the label; snap cancels it', async () => {
    let frames = 0;
    const clock = { animate: (_ms: number, frame: (t: number) => void, cancelled: () => boolean) => { frame(0.5); frames++; return Promise.resolve(!cancelled()); } };
    const scene = new BoardScene(660, clock); scene.snap(project(owning()), 'a');
    await scene.play({ kind: 'rentPayment', from: 'a', to: 'b', amount: 120 });
    expect(frames).toBe(1); expect(scene.root.children.some(c => c.label === 'rent-payment')).toBe(false);
    await scene.play({ kind: 'rentPayment', from: 'a', to: 'nobody', amount: 120 }); expect(frames).toBe(1);
  });
});

describe('rent and building intents', () => {
  it('sends PayRent with null and BuildHouse / SellHouse with the asset, all to the projected turn, through the protocol decoder', () => {
    const h = harness({ stored: storedSession(room([['a', 'Alice'], ['b', 'Bob']])) });
    h.client.start(); h.sockets.last().open();
    const view = project(withRent(owning())); h.sockets.last().receive(welcome(view));
    h.client.sendCommand('PayRent');
    h.client.sendCommand({ type: 'BuildHouse', payload: { assetId: at(view, 9) } });
    h.client.sendCommand({ type: 'SellHouse', payload: { assetId: at(view, 6) } });
    const target = { kind: 'target', target: { kind: 'turn', id: view.turn!.turnId } };
    expect(h.sockets.last().sent.slice(-3)).toEqual([
      { t: 'Command', commandId: 'c1', type: 'PayRent', expected: target, payload: null },
      { t: 'Command', commandId: 'c2', type: 'BuildHouse', expected: target, payload: { assetId: at(view, 9) } },
      { t: 'Command', commandId: 'c3', type: 'SellHouse', expected: target, payload: { assetId: at(view, 6) } },
    ]);
    for (const frame of h.sockets.last().sent.slice(-3)) expect(decodeClientFrame(JSON.stringify(frame)).ok).toBe(true);
    // A second BuildHouse while one is pending is not sent.
    h.client.sendCommand({ type: 'BuildHouse', payload: { assetId: at(view, 9) } }); expect(h.sockets.last().sent).toHaveLength(4);
    h.client.returnToLobby();
  });
  it('shows a rejected Ack with its code, message and reason and keeps the view on an accepted Ack', async () => {
    const h = harness({ stored: storedSession(room([['a', 'Alice'], ['b', 'Bob']])) });
    h.client.start(); h.sockets.last().open();
    const view = project(owning()); h.sockets.last().receive(welcome(view));
    h.client.sendCommand({ type: 'BuildHouse', payload: { assetId: at(view, 6) } });
    h.sockets.last().receive({ t: 'Ack', commandId: 'c1' as CommandId, outcome: 'rejected', revision: view.revision, error: { code: 'UNEVEN_BUILD', message: 'UNEVEN_BUILD' } });
    expect(h.client.game.messages.at(-1)).toMatchObject({ code: 'UNEVEN_BUILD', message: 'UNEVEN_BUILD', commandType: 'BuildHouse' });
    expect(h.client.game.view).toEqual(view);
    h.client.sendCommand({ type: 'BuildHouse', payload: { assetId: at(view, 9) } });
    h.sockets.last().receive({ t: 'Ack', commandId: 'c2' as CommandId, outcome: 'accepted', revision: view.revision });
    expect(h.client.game.view!.houses).toEqual(view.houses); expect(h.client.game.view!.balances).toEqual(view.balances);
    const base = { me: pid('a'), connected: true, pending: [] as ClientCommandType[], now: 50_000, problem: null, fatal: null, nameOf, colorOf, view };
    const w = mount(Hud, { props: { ...base, messages: h.client.game.messages } });
    expect(w.get('[data-testid="message"]').text()).toContain(`UNEVEN_BUILD: UNEVEN_BUILD — ${HOUSE_REASONS.UNEVEN_BUILD}`);
    h.client.returnToLobby();
  });
  it('shows no house reason for a rejected purchase or bid with a shared code (RVW-001)', () => {
    const h = harness({ stored: storedSession(room([['a', 'Alice'], ['b', 'Bob']])) });
    h.client.start(); h.sockets.last().open();
    const s = owning(); const decision = project({ ...s, purchase: { playerId: pid('a'), cell: 13, assetId: at(s, 13) } });
    h.sockets.last().receive(welcome(decision));
    h.client.sendCommand('BuyAsset');
    h.sockets.last().receive({ t: 'Ack', commandId: 'c1' as CommandId, outcome: 'rejected', revision: decision.revision, error: { code: 'INSUFFICIENT_FUNDS', message: 'Purchase exceeds balance' } });
    const auction = project({ ...s, turn: { ...s.turn!, pausedRemainingMs: 1000 }, auction: {
      auctionId: 'u1', assetId: at(s, 13), cell: 13, price: 1210 as Money, startBid: 720 as Money, step: 60 as Money, reason: 'choice', order: s.order!,
      passed: [], leader: null, leadingBid: null, bids: [], responder: pid('a'), responseId: 'r1', responseDeadline: 60_000 as never,
    } });
    h.sockets.last().receive(welcome(auction));
    h.client.sendCommand('Bid');
    h.sockets.last().receive({ t: 'Ack', commandId: 'c2' as CommandId, outcome: 'rejected', revision: auction.revision, error: { code: 'INSUFFICIENT_FUNDS', message: 'Bid exceeds balance' } });
    h.client.sendCommand({ type: 'BuildHouse', payload: { assetId: at(s, 9) } });
    h.sockets.last().receive({ t: 'Ack', commandId: 'c3' as CommandId, outcome: 'rejected', revision: auction.revision, error: { code: 'INSUFFICIENT_FUNDS', message: 'INSUFFICIENT_FUNDS' } });
    expect(h.client.game.messages.map(m => m.commandType)).toEqual(['BuyAsset', 'Bid', 'BuildHouse']);
    const base = { me: pid('a'), connected: true, pending: [] as ClientCommandType[], now: 50_000, problem: null, fatal: null, nameOf, colorOf, view: auction };
    const texts = mount(Hud, { props: { ...base, messages: h.client.game.messages } }).findAll('[data-testid="message"]').map(m => m.text());
    expect(texts[0]).toContain('INSUFFICIENT_FUNDS: Purchase exceeds balance'); expect(texts[0]).not.toContain(HOUSE_REASONS.INSUFFICIENT_FUNDS);
    expect(texts[1]).toContain('INSUFFICIENT_FUNDS: Bid exceeds balance'); expect(texts[1]).not.toContain(HOUSE_REASONS.INSUFFICIENT_FUNDS);
    expect(texts[2]).toContain(`INSUFFICIENT_FUNDS: INSUFFICIENT_FUNDS — ${HOUSE_REASONS.INSUFFICIENT_FUNDS}`);
    h.client.returnToLobby();
  });
});
