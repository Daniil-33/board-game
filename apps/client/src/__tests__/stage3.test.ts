import { mount, flushPromises } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { Q, timestamp, nextBidAmount, type StateView } from '@game/game-core';
import PurchaseDialog from '../components/PurchaseDialog.vue';
import AuctionPanel from '../components/AuctionPanel.vue';
import TurnTimer from '../components/TurnTimer.vue';
import AssetCard from '../components/AssetCard.vue';
import { BoardScene, TOKEN_COLORS } from '../board/BoardCanvas';
import { actionAvailability, canIssue, commandExpectation, type ActionContext } from '../game/view';
import { playingView, pid, harness, storedSession, room, welcome, update } from './helpers';

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
    const w = mount(PurchaseDialog, { props: props({ ...view, balances: { ...view.balances, a: price } }) });
    expect(w.get('[data-test="buy"]').attributes('disabled')).toBeUndefined();
    await w.get('[data-test="buy"]').trigger('click'); expect(w.emitted('command')).toEqual([['BuyAsset']]);
    await w.setProps({ view: { ...view, balances: { a: Q(price - 10) } } });
    expect(w.get('[data-test="buy"]').attributes('disabled')).toBeDefined();
    expect(w.get('[data-test="start-auction"]').attributes('disabled')).toBeUndefined();
    for (const extra of [{ connected: false }, { now: 100_000 }, { pending: ['StartAuction'] }] satisfies Partial<ActionContext>[]) {
      const context = { ...props(view), ...extra };
      expect(canIssue(context, 'StartAuction')).toBe(false);
    }
    await w.setProps({ me: pid('b') }); expect(w.find('button').exists()).toBe(false); expect(w.text()).toContain('Player a is deciding');
    await w.setProps({ me: pid('a'), view: { ...view, eliminated: [pid('a')] } }); expect(w.find('button').exists()).toBe(false);
  });
  it('auction roles, projected amounts, deadlines and restored leader', async () => {
    const view = auction(); const a = view.auction!;
    const w = mount(AuctionPanel, { props: props(view) });
    expect(w.get('[data-test="bid"]').text()).toBe(`Bid ${a.startBid}`);
    await w.get('[data-test="pass"]').trigger('click'); expect(w.emitted('command')).toEqual([['PassAuction']]);
    const raised = { ...view, auction: { ...a, leader: pid('b'), leadingBid: Q(a.startBid + a.step), passed: [pid('c')], responseId: 'r2', responseDeadline: timestamp(52_400) } };
    await w.setProps({ view: raised }); expect(w.text()).toContain('Player b'); expect(w.text()).toContain('Player c');
    expect(w.get('[data-test="bid"]').text()).toBe(`Bid ${nextBidAmount(raised.auction)}`); expect(w.get('[data-test="auction-timer"]').text()).toBe('3 s');
    await w.setProps({ view: { ...raised, balances: { a: Q(0) } } }); expect(w.get('[data-test="bid"]').attributes('disabled')).toBeDefined();
    await w.setProps({ now: 53_000 }); expect(w.get('[data-test="auction-timer"]').text()).toBe('0 s'); expect(w.get('[data-test="pass"]').attributes('disabled')).toBeDefined(); expect(w.find('[data-test="auction"]').exists()).toBe(true);
    await w.setProps({ me: pid('b') }); expect(w.find('button').exists()).toBe(false);
    await w.setProps({ me: pid('a'), view: { ...view, eliminated: [pid('a')] } }); expect(w.find('button').exists()).toBe(false);
    for (const extra of [{ connected: false }, { now: 60_000 }, { pending: ['Bid', 'PassAuction'] }] satisfies Partial<ActionContext>[]) {
      expect(canIssue({ ...props(view), ...extra }, 'Bid')).toBe(false);
      expect(canIssue({ ...props(view), ...extra }, 'PassAuction')).toBe(false);
    }
    expect(canIssue(props(view), 'EndTurn')).toBe(false); expect(canIssue(props(view), 'RollDice')).toBe(false);
  });
  it('shows paused even at zero and follows a resumed deadline', async () => {
    const w = mount(TurnTimer, { props: { deadline: 10, now: 50_000, paused: true } }); expect(w.text()).toBe('paused');
    await w.setProps({ paused: false, deadline: 62_400 }); expect(w.text()).toBe('13 s');
  });
  it('refreshes markers and an open card without regenerating cells', async () => {
    const v = purchase(); const p = v.purchase!; const cell = v.board!.cells[p.cell]!;
    const scene = new BoardScene(); scene.snap(v, 'a'); const first = scene.cells.children[0];
    const w = mount(AssetCard, { props: { cell, board: v.board! } }); expect(w.text()).toContain('free');
    scene.refreshOwnership({ ...v, owners: { [p.assetId]: pid('b') } });
    expect(scene.ownership.children[0]!.tint).toBe(TOKEN_COLORS[1]);
    expect(scene.ownership.children.map(c => c.label)).toEqual([`owner-${p.cell}-b`]); expect(scene.cells.children[0]).toBe(first);
    await w.setProps({ owner: 'Player b' }); expect(w.get('[data-test="asset-owner"]').text()).toBe('Player b'); w.unmount();
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
