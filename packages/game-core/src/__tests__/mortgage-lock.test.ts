import { describe, expect, it } from 'vitest';
import { checkInvariants, gameEngine, mortgageAdvance, openCharge, projectState, settleDebt, type GameCommand, type GameState, type Money } from '../index.js';
import { playingGame } from './helpers/game.js';
import { cmd, ctx, pid, player } from './helpers/fixtures.js';

const base = () => playingGame(['a', 'b', 'c']).state;
const command = (s: GameState, type: string, payload: unknown = null, by = s.turn!.playerId): GameCommand =>
  cmd(type, payload, { actor: player(by), target: { kind: 'turn', id: s.turn!.turnId } });
const run = (s: GameState, type: string, payload: unknown = null, by = s.turn!.playerId) => gameEngine.execute(s, command(s, type, payload, by), ctx());

describe('mortgage redeem lock', () => {
  it('locks manual mortgages in the same turn and exposes the lock in the view', () => {
    const s = base();
    const asset = s.board!.cells[1]!.asset!;
    const owned = { ...s, owners: { [asset.assetId]: pid('a') } };
    const mortgage = run(owned, 'Mortgage', { assetId: asset.assetId });
    expect(mortgage.kind).toBe('accepted');
    if (mortgage.kind !== 'accepted') return;
    expect(mortgage.state.mortgages[asset.assetId]!.lockedTurnId).toBe(s.turn!.turnId);
    expect(projectState(mortgage.state, { kind: 'spectator' }).mortgages[asset.assetId]!.lockedTurnId).toBe(s.turn!.turnId);
    const redeem = run(mortgage.state, 'Redeem', { assetId: asset.assetId });
    expect(redeem.kind === 'rejected' && redeem.error.code).toBe('REDEEM_LOCKED');
  });

  it('allows redemption on the owner’s next regular turn', () => {
    const initial = base();
    const asset = initial.board!.cells[1]!.asset!;
    const owned = { ...initial, owners: { [asset.assetId]: pid('a') } };
    const mortgaged = run(owned, 'Mortgage', { assetId: asset.assetId });
    if (mortgaged.kind !== 'accepted') throw new Error(mortgaged.error.code);
    let after = mortgaged.state;
    for (let i = 0; i < 3; i++) {
      after = { ...after, turn: { ...after.turn!, rolled: true } };
      const end = run(after, 'EndTurn');
      if (end.kind !== 'accepted') throw new Error(end.error.code);
      after = end.state;
    }
    expect(after.turn!.playerId).toBe('a');
    const redeemed = run(after, 'Redeem', { assetId: asset.assetId });
    expect(redeemed.kind).toBe('accepted');
  });

  it('allows redemption in the new bonus turn after a double', () => {
    const initial = base();
    const asset = initial.board!.cells[1]!.asset!;
    const owned = { ...initial, owners: { [asset.assetId]: pid('a') }, turn: { ...initial.turn!, rolled: true, pendingBonus: true, doublesStreak: 1 } };
    const mortgaged = run(owned, 'Mortgage', { assetId: asset.assetId });
    if (mortgaged.kind !== 'accepted') throw new Error(mortgaged.error.code);
    const ended = run(mortgaged.state, 'EndTurn');
    expect(ended.kind).toBe('accepted');
    if (ended.kind !== 'accepted') return;
    expect(ended.state.turn!.playerId).toBe('a');
    expect(ended.state.turn!.bonus).toBe(true);
    expect(ended.state.turn!.turnId).not.toBe(mortgaged.state.turn!.turnId);
    expect(run(ended.state, 'Redeem', { assetId: asset.assetId }).kind).toBe('accepted');
  });

  it('stamps mortgages created during automatic liquidation with the open turn id', () => {
    const s = base();
    const asset = s.board!.cells[1]!.asset!;
    const initial: GameState = { ...s, owners: { [asset.assetId]: pid('a') }, balances: { ...s.balances, a: 10 as Money } };
    const result = settleDebt(initial, { payerId: pid('a'), creditor: { kind: 'bank' }, amount: mortgageAdvance(asset.price), cause: { kind: 'chance', auto: true } }, ctx().now);
    expect(result.bankrupt).toBe(false);
    expect(result.state.mortgages[asset.assetId]!.lockedTurnId).toBe(s.turn!.turnId);
    checkInvariants(result.state);
  });

  it('blocks build and redeem during charge while sale and mortgage remain available', () => {
    const s = base();
    const group = s.board!.cells.filter(c => c.asset?.groupId === 'M2');
    const assets = group.map(c => c.asset!);
    const other = s.board!.cells.find(c => c.asset?.groupId !== 'M2' && c.kind === 'monopoly')!.asset!;
    const another = s.board!.cells.find(c => c.kind === 'monopoly' && c.asset !== null && c.asset.groupId !== 'M2' && c.asset.assetId !== other.assetId)!.asset!;
    const owned: GameState = { ...s, owners: Object.fromEntries([...assets, other, another].map(a => [a.assetId, pid('a')])),
      houses: Object.fromEntries(assets.map(a => [a.assetId, 1])),
      mortgages: { [other.assetId]: { advance: mortgageAdvance(other.price), lapsCompleted: 0, pending: [...s.order!], lockedTurnId: null } } };
    const due = openCharge({ ...owned, turn: { ...owned.turn!, rolled: true } }, 60 as Money).state;
    for (const type of ['BuildHouse', 'Redeem']) {
      const result = run(due, type, { assetId: type === 'BuildHouse' ? assets[0]!.assetId : other.assetId });
      expect(result.kind === 'rejected' && result.error.code).toBe('PAYMENT_PENDING');
    }
    expect(run(due, 'SellHouse', { assetId: assets[0]!.assetId }).kind).toBe('accepted');
    expect(run(due, 'Mortgage', { assetId: another.assetId }).kind).toBe('accepted');
  });
});
