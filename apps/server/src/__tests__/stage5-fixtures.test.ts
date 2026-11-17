import { expect, it } from 'vitest';
import { checkInvariants, entropy, gameEngine, timestamp, type GameCommand, type GameEvent, type GameState } from '@game/game-core';
import { buildFixture, STAGE5_FIXTURE_NAMES } from '../test-fixtures.js';

const NOW = 1767225600000;
const ids = ['g-0', 'g-1', 'g-2'];

function run(state: GameState, type: string): { state: GameState; events: readonly GameEvent[] } {
  const command: GameCommand = { type, payload: null, commandId: `probe-${type}` as never,
    actor: { kind: 'player', id: state.turn!.playerId },
    expected: { kind: 'target', target: { kind: 'turn', id: state.turn!.turnId } } };
  const result = gameEngine.execute(state, command, { now: timestamp(NOW + 1000), entropy: entropy([1, 2, 3, 4]) });
  if (result.kind !== 'accepted') throw new Error(result.error.code);
  checkInvariants(result.state);
  return result;
}
const steps = (events: readonly GameEvent[]) =>
  (events.find(e => e.type === 'LiquidationApplied')?.payload as { steps: { tier: number; kind: string; assetId: string }[] } | undefined)?.steps;

it.each(STAGE5_FIXTURE_NAMES)('%s is a core-7 state for three guests', name => {
  const state = buildFixture(name, ids, NOW);
  checkInvariants(state);
  expect(state.rulesVersion).toBe('core-7');
  expect(state.players.map(p => p.id)).toEqual(ids);
});

it('mortgage-expiry expires its one mortgage when the turn ends', () => {
  const state = buildFixture('mortgage-expiry', ids, NOW);
  const [assetId] = Object.keys(state.mortgages);
  expect(state.mortgages[assetId!]).toMatchObject({ lapsCompleted: 7, pending: [state.turn!.playerId] });
  const next = run(state, 'EndTurn');
  expect(next.events.filter(e => e.type === 'MortgageExpired')).toEqual([
    { type: 'MortgageExpired', payload: { playerId: state.turn!.playerId, assetId, advance: state.mortgages[assetId!]!.advance } },
  ]);
  expect(next.state.mortgages).toEqual({});
  expect(next.state.owners[assetId!]).toBeUndefined();
});

it('mortgage-restart expires one term and advances the other at the next boundary', () => {
  const state = buildFixture('mortgage-restart', ids, NOW);
  expect(Object.keys(state.mortgages)).toHaveLength(2);
  const next = run(state, 'EndTurn');
  expect(next.events.filter(e => e.type === 'MortgageExpired')).toHaveLength(1);
  expect(Object.values(next.state.mortgages)).toEqual([expect.objectContaining({ lapsCompleted: 3, pending: state.order!.filter(p => p !== state.turn!.playerId) })]);
});

it.each([1, 2, 3] as const)('liquidation-tier-%i pays rent through that tier only', tier => {
  const state = buildFixture(`liquidation-tier-${tier}`, ids, NOW);
  const rent = state.rent!;
  expect(state.balances[rent.payerId]).toBe(rent.amount - 10);
  const next = run(state, 'PayRent');
  expect(steps(next.events)).toEqual([expect.objectContaining({ tier, kind: tier === 3 ? 'sell-house' : 'mortgage' })]);
  expect(next.events.some(e => e.type === 'RentPaid')).toBe(true);
  expect(next.state.balances[rent.ownerId]).toBe(state.balances[rent.ownerId]! + rent.amount);
  expect(next.state.eliminated).toEqual([]);
});

it.each(['bankruptcy', 'final-bankruptcy'] as const)('%s bankrupts the payer to the player creditor', name => {
  const state = buildFixture(name, ids, NOW);
  const rent = state.rent!;
  expect(state.eliminated).toEqual(name === 'bankruptcy' ? [] : ids.filter(id => id !== rent.payerId && id !== rent.ownerId));
  expect(state.order).toHaveLength(name === 'bankruptcy' ? 3 : 2);
  const next = run(state, 'PayRent');
  expect(next.events.find(e => e.type === 'PlayerBankrupt')!.payload).toEqual({
    playerId: rent.payerId, creditorId: rent.ownerId, debt: rent.amount, paid: 10, writtenOff: rent.amount - 10 });
  expect(next.state.balances[rent.ownerId]).toBe(state.balances[rent.ownerId]! + 10);
  expect(Object.keys(next.state.mortgages)).toEqual([]);
  expect(Object.values(next.state.owners)).not.toContain(rent.payerId);
  expect(next.state.phase).toBe(name === 'bankruptcy' ? 'playing' : 'finished');
  if (name === 'final-bankruptcy') {
    expect(next.state.winner).toBe(rent.ownerId);
    expect(next.events.at(-1)!.type).toBe('GameEnded');
  }
});

it('liquidation-multi-tier mortgages, sells the house, then mortgages the bare asset', () => {
  const state = buildFixture('liquidation-multi-tier', ids, NOW);
  const rent = state.rent!;
  const built = Object.keys(state.houses).find(id => state.owners[id] === rent.payerId)!;
  const next = run(state, 'PayRent');
  expect(steps(next.events)).toEqual([
    expect.objectContaining({ tier: 1, kind: 'mortgage' }),
    { tier: 3, kind: 'sell-house', assetId: built, amount: expect.any(Number) },
    expect.objectContaining({ tier: 3, kind: 'mortgage', assetId: built }),
  ]);
  expect(steps(next.events)![0]!.assetId).not.toBe(built);
  expect(next.events.at(-1)).toEqual({ type: 'RentPaid', payload: { payerId: rent.payerId, ownerId: rent.ownerId,
    assetId: rent.assetId, amount: rent.amount, auto: false } });
  expect(next.state.houses[built]).toBeUndefined();
  expect(next.state.eliminated).toEqual([]);
});

it('bankruptcy-houses sells the house, pays the cash and frees every asset', () => {
  const state = buildFixture('bankruptcy-houses', ids, NOW);
  const rent = state.rent!;
  const owned = Object.keys(state.owners).filter(id => state.owners[id] === rent.payerId);
  const built = Object.keys(state.houses).find(id => state.owners[id] === rent.payerId)!;
  const next = run(state, 'PayRent');
  const sold = next.events.find(e => e.type === 'HouseSold')!.payload as { assetId: string; refund: number };
  expect(sold.assetId).toBe(built);
  const paid = 10 + sold.refund;
  expect(next.events.find(e => e.type === 'PlayerBankrupt')!.payload).toEqual({
    playerId: rent.payerId, creditorId: rent.ownerId, debt: rent.amount, paid, writtenOff: rent.amount - paid });
  expect(next.events.find(e => e.type === 'AssetsReleased')!.payload).toEqual({ playerId: rent.payerId, assetIds: owned, reason: 'bankrupt' });
  for (const id of owned) {
    expect(next.state.owners[id]).toBeUndefined();
    expect(next.state.houses[id]).toBeUndefined();
    expect(next.state.mortgages[id]).toBeUndefined();
  }
  expect(next.state.balances[rent.ownerId]).toBe(state.balances[rent.ownerId]! + paid);
  expect(next.state.phase).toBe('playing');
});
