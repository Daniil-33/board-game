// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { nextBidAmount } from '@game/game-core';
import type { ClientCommandType } from '@game/protocol';
import { MockGame } from '../game';

function offered() {
  const game = new MockGame({ turnMs: 45000, continuationMs: 20000 });
  for (const id of ['a','b','c']) game.addPlayer(id);
  game.start(0);
  while (game.view.setup) {
    const s = game.view.setup;
    expect(game.command(s.playerId, 'RollForOrder', { kind: 'target', target: { kind: 'setupRoll', id: s.setupRollId } }, 1).ok).toBe(true);
  }
  const t = game.view.turn!;
  expect(game.command(t.playerId, 'RollDice', { kind: 'target', target: { kind: 'turn', id: t.turnId } }, 2).ok).toBe(true);
  expect(game.view.purchase).not.toBeNull();
  return game;
}
function act(game: MockGame, type: ClientCommandType, now = 3) {
  const v = game.view; const a = v.auction;
  const result = game.command(a?.responder ?? v.turn!.playerId, type, { kind: 'target', target: a ? { kind: 'auctionResponse', id: a.responseId } : { kind: 'turn', id: v.turn!.turnId } }, now);
  expect(result.ok, JSON.stringify(result)).toBe(true);
  return result;
}
describe('mock acquisition scripts', () => {
  it('buys from a projected decision', () => {
    const g = offered(); const p = g.view.purchase!; const balance = g.view.balances[p.playerId]!; const price = g.view.board!.cells[p.cell]!.asset!.price;
    act(g, 'BuyAsset'); expect(g.view.owners[p.assetId]).toBe(p.playerId); expect(g.view.balances[p.playerId]).toBe(balance - price); expect(g.view.purchase).toBeNull();
  });
  it('shows start, outbid, pass and timeout, then awards ownership', () => {
    const g = offered(); act(g, 'StartAuction'); const a = g.view.auction!;
    expect(nextBidAmount(a)).toBe(a.startBid); act(g, 'Bid');
    expect(nextBidAmount(g.view.auction!)).toBe(a.startBid + a.step); const winner = g.view.auction!.responder; act(g, 'Bid');
    expect(g.view.auction!.leader).toBe(winner); act(g, 'PassAuction');
    const events = g.timeout(g.view.auction!.responseDeadline)!;
    expect(events.map(e => e.type)).toContain('AuctionWon'); expect(g.view.owners[a.assetId]).toBe(winner); expect(g.view.auction).toBeNull(); expect(g.view.turn!.pausedRemainingMs).toBeNull();
  });
  it('leaves the asset free after everyone passes', () => {
    const g = offered(); act(g, 'StartAuction'); const id = g.view.auction!.assetId;
    while (g.view.auction) act(g, 'PassAuction');
    expect(g.view.owners[id]).toBeUndefined(); expect(g.view.purchase).toBeNull();
  });
});
