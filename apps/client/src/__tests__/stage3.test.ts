import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils';
import { h, ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Q, timestamp, nextBidAmount, type StateView } from '@game/game-core';
import { PurchaseDialog } from '../widgets/purchase-card/index';
import { AuctionPanel } from '../widgets/auction-panel/index';
import { TurnTimer } from '../widgets/turn-header/index';
import { AssetCard } from '../widgets/asset-card/index';
import { BoardScene } from '../widgets/board/index';
import { actionAvailability, canIssue, commandExpectation, type ActionContext } from '../entities/game/index';
import { playingView, pid, harness, storedSession, room, welcome, update, withUi } from './helpers';

enableAutoUnmount(afterEach);
const originalWidth = window.innerWidth;
const resize = (window as Window & { happyDOM?: { setInnerWidth: (width: number) => void } }).happyDOM!;
afterEach(() => resize.setInnerWidth(originalWidth));

function purchase(): StateView {
  const v = playingView(['a', 'b', 'c'], { rolled: true });
  const cell = v.board!.cells.find(c => c.asset !== null)!;
  return { ...v, purchase: { playerId: pid('a'), cell: cell.index, assetId: cell.asset!.assetId } };
}
function auction(): StateView {
  const v = purchase(); const p = v.purchase!; const price = v.board!.cells[p.cell]!.asset!.price;
  return { ...v, purchase: null, turn: { ...v.turn!, pausedRemainingMs: 0 }, auction: {
    auctionId: 'a1', assetId: p.assetId, cell: p.cell, price, startBid: Q(price * 60 / 100), step: Q(price * 5 / 100),
    reason: 'choice', order: v.order!, passed: [], leader: null, leadingBid: null, bids: [], responder: pid('a'), responseId: 'r1', responseDeadline: timestamp(60_000),
  } };
}
const props = (view: StateView) => ({ view, me: pid('a'), connected: true, pending: [], now: 50_000, nameOf: (id: string) => `Player ${id}` });

describe('purchase and auction projection', () => {
  it('exposes real purchase and auction action availability', () => {
    expect(actionAvailability(props(purchase()))).toMatchObject({ BuyAsset: true, StartAuction: true, Bid: false, PassAuction: false });
    expect(actionAvailability(props(auction()))).toMatchObject({ BuyAsset: false, StartAuction: false, Bid: true, PassAuction: true, RollDice: false, EndTurn: false });
    expect(actionAvailability({ ...props(auction()), me: pid('b') })).toMatchObject({ Bid: false, PassAuction: false });
  });
  it('purchase affordability, viewer roles and emitted intent', async () => {
    const view = purchase(); const price = view.board!.cells[view.purchase!.cell]!.asset!.price;
    const state = ref(props({ ...view, balances: { ...view.balances, a: price } }));
    const command = vi.fn();
    mount(withUi(() => h(PurchaseDialog, { ...state.value, onCommand: command })), { attachTo: document.body });
    const target = (selector: string) => document.querySelector<HTMLElement>(selector)!;
    await flushPromises();
    expect(target('[role="dialog"]').getAttribute('aria-modal')).toBe('true');
    expect(target('[data-testid="purchase-rent-preview"]')).toBeTruthy();
    expect(target('[data-testid="purchase-timer"]')).toBeTruthy();
    expect(target('[data-testid="purchase-logo"], [data-testid="purchase-logo-fallback"]')).toBeTruthy();
    target('[role="dialog"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(target('[data-testid="purchase"]')).toBeTruthy();
    expect(target('[data-testid="buy"]').hasAttribute('disabled')).toBe(false);
    target('[data-testid="buy"]').click(); expect(command).toHaveBeenCalledWith('BuyAsset');
    state.value = { ...state.value, view: { ...view, balances: { a: Q(price - 10) } } }; await flushPromises();
    expect(target('[data-testid="buy"]').hasAttribute('disabled')).toBe(true);
    expect(target('[data-testid="buy"]').getAttribute('aria-describedby')).toBeTruthy();
    expect(target('[data-testid="start-auction"]').hasAttribute('disabled')).toBe(false);
    for (const extra of [{ connected: false }, { now: 100_000 }, { pending: ['StartAuction'] }] satisfies Partial<ActionContext>[]) {
      const context = { ...props(view), ...extra };
      expect(canIssue(context, 'StartAuction')).toBe(false);
    }
    state.value = { ...state.value, me: pid('b'), view }; await flushPromises();
    expect(document.querySelector('[data-testid="buy"], [data-testid="start-auction"], [data-testid="bid"], [data-testid="pass"]')).toBeNull(); expect(target('[data-testid="purchase"]').textContent).toContain('Player a решает');
    state.value = { ...state.value, me: pid('a'), view: { ...view, eliminated: [pid('a')] } }; await flushPromises();
    expect(document.querySelector('[data-testid="buy"], [data-testid="start-auction"], [data-testid="bid"], [data-testid="pass"]')).toBeNull();
  });
  it('auction roles, projected amounts, deadlines and restored leader', async () => {
    const view = auction(); const a = view.auction!;
    const w = mount(AuctionPanel, { props: props(view) });
    expect(w.get('[data-testid="bid"]').text()).toBe(`Поднять до ${a.startBid}`);
    await w.get('[data-testid="pass"]').trigger('click'); expect(w.emitted('command')).toEqual([['PassAuction']]);
    const raised = { ...view, auction: { ...a, leader: pid('b'), leadingBid: Q(a.startBid + a.step), passed: [pid('c')], responseId: 'r2', responseDeadline: timestamp(52_400) } };
    await w.setProps({ view: raised }); expect(w.text()).toContain('Player b'); expect(w.text()).toContain('Player c');
    expect(w.get('[data-testid="auction-leader"]').attributes('style')).toContain('var(--player-2)');
    expect(w.get('[data-testid="auction-timer"]').attributes('data-last-seconds')).toBe('true');
    expect(w.get('[data-testid="bid"]').text()).toBe(`Поднять до ${nextBidAmount(raised.auction)}`); expect(w.get('[data-testid="auction-timer"]').text()).toBe('3 с');
    await w.setProps({ view: { ...raised, balances: { a: Q(0) } } }); expect(w.get('[data-testid="bid"]').attributes('disabled')).toBeDefined();
    await w.setProps({ now: 53_000 }); expect(w.get('[data-testid="auction-timer"]').text()).toBe('0 с'); expect(w.get('[data-testid="pass"]').attributes('disabled')).toBeDefined(); expect(w.find('[data-testid="auction"]').exists()).toBe(true);
    await w.setProps({ me: pid('b') }); expect(w.find('[data-testid="buy"], [data-testid="start-auction"], [data-testid="bid"], [data-testid="pass"]').exists()).toBe(false);
    await w.setProps({ me: pid('a'), view: { ...view, eliminated: [pid('a')] } }); expect(w.find('[data-testid="buy"], [data-testid="start-auction"], [data-testid="bid"], [data-testid="pass"]').exists()).toBe(false);
    for (const extra of [{ connected: false }, { now: 60_000 }, { pending: ['Bid', 'PassAuction'] }] satisfies Partial<ActionContext>[]) {
      expect(canIssue({ ...props(view), ...extra }, 'Bid')).toBe(false);
      expect(canIssue({ ...props(view), ...extra }, 'PassAuction')).toBe(false);
    }
    expect(canIssue(props(view), 'EndTurn')).toBe(false); expect(canIssue(props(view), 'RollDice')).toBe(false);
  });
  it('shows the required auction response in a non-dismissible mobile sheet', async () => {
    resize.setInnerWidth(390);
    mount(AuctionPanel, { props: props(auction()), attachTo: document.body });
    await flushPromises();
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(document.querySelector('[data-testid="auction"]')).toBeTruthy();
  });
  it('shows paused even at zero and follows a resumed deadline', async () => {
    const w = mount(TurnTimer, { props: { deadline: 10, now: 50_000, paused: true } }); expect(w.text()).toBe('таймер хода на паузе');
    await w.setProps({ paused: false, deadline: 62_400 }); expect(w.text()).toBe('13 с');
  });
  it('refreshes markers and an open card without regenerating cells', async () => {
    const v = purchase(); const p = v.purchase!; const cell = v.board!.cells[p.cell]!;
    const scene = new BoardScene(); scene.snap(v, 'a'); const first = scene.cells.children[0];
    const w = mount(AssetCard, { props: { cell, board: v.board! } }); expect(w.text()).toContain('свободно');
    scene.refreshOwnership({ ...v, owners: { [p.assetId]: pid('b') } });
    expect(scene.ownership.children[0]!.context.instructions[0]).toMatchObject({ action: 'stroke', data: { style: { color: Number.parseInt(scene.theme.players[1]!.slice(1), 16) } } });
    expect(scene.ownership.children.map(c => c.label)).toEqual([`owner-${p.cell}-b`]); expect(scene.cells.children[0]).toBe(first);
    await w.setProps({ owner: 'Player b' }); expect(w.get('[data-testid="asset-owner"]').text()).toBe('Player b'); w.unmount();
  });
  it('refreshes ownership immediately during movement and on Welcome', async () => {
    const h = harness({ stored: storedSession(room([['a','Alice'],['b','Bob']])) });
    const refresh = vi.fn(); h.board.refreshOwnership = refresh;
    h.client.start(); h.sockets.last().open(); const v = purchase(); h.sockets.last().receive(welcome(v)); h.client.attachBoard(h.board);
    let finish!: () => void; h.board.play = () => new Promise<void>(resolve => { finish = resolve; });
    const changed = { ...v, revision: (v.revision + 1) as typeof v.revision, owners: { [v.purchase!.assetId]: pid('b') } };
    h.sockets.last().receive(update(changed, [{ type: 'PlayerMoved', payload: { playerId: 'a', from: 0, to: 1, steps: 1 } }]));
    expect(refresh).toHaveBeenLastCalledWith(changed); expect(finish).toBeTypeOf('function');
    finish(); await flushPromises(); h.sockets.last().receive(welcome(changed));
    expect(h.board.snaps.at(-1)?.positions).toEqual(changed.positions); expect(refresh).toHaveBeenLastCalledWith(changed); h.client.returnToLobby();
  });
  it('uses response targets, null intents and Ack errors; views restore independently of events', () => {
    const h = harness({ stored: storedSession(room([['a','Alice'],['b','Bob']])) }); h.client.start(); h.sockets.last().open();
    const decision = purchase(); h.sockets.last().receive(welcome(decision));
    for (const type of ['BuyAsset', 'StartAuction'] as const) {
      expect(commandExpectation(decision, type)).toEqual({ kind: 'target', target: { kind: 'turn', id: decision.turn!.turnId } });
      h.client.sendCommand(type); const sent = h.client.game.pending[0]!; expect(sent.payload).toBeNull();
      h.sockets.last().receive({ t: 'Ack', commandId: sent.commandId, outcome: 'accepted', revision: decision.revision });
      expect(h.client.game.view!.purchase).toEqual(decision.purchase);
    }
    const v = auction(); h.sockets.last().receive(welcome(v));
    expect(commandExpectation(v, 'Bid')).toEqual({ kind: 'target', target: { kind: 'auctionResponse', id: 'r1' } });
    h.client.sendCommand('Bid'); const frame = h.client.game.pending[0]!; expect(frame.payload).toBeNull();
    h.sockets.last().receive({ t: 'Ack', commandId: frame.commandId, outcome: 'rejected', revision: v.revision, error: { code: 'TARGET_MISMATCH', message: 'Response changed' } });
    expect(h.client.game.messages[0]).toMatchObject({ code: 'TARGET_MISMATCH' }); expect(h.client.game.view!.auction).toEqual(v.auction);
    h.client.sendCommand('PassAuction'); const pass = h.client.game.pending[0]!;
    h.sockets.last().receive({ t: 'Ack', commandId: pass.commandId, outcome: 'accepted', revision: v.revision }); expect(h.client.game.view!.auction).toEqual(v.auction);
    const restored = { ...v, revision: (v.revision + 1) as typeof v.revision, auction: { ...v.auction!, leader: pid('b'), leadingBid: Q(100), responder: pid('a'), passed: [pid('c')] } };
    h.sockets.last().receive(update(restored, [{ type: 'PlayerResigned', payload: { playerId: 'c' } }])); expect(h.client.game.view!.auction).toEqual(restored.auction);
    h.sockets.last().receive(welcome(v)); expect(h.client.game.view!.auction).toEqual(v.auction); h.client.returnToLobby();
  });
});
