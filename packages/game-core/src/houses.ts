import type { AssetId, Money, PlayerId } from './types.js';
import type { GameState } from './state.js';
import type { GameCommand, GameEvent } from './engine.js';
import { creditBalance, debitBalance } from './money.js';
import { isMortgaged, quantumRatio } from './rent.js';
import { fail, ok, targetGuard, type CommandRegistry } from './registry.js';
export type HouseErrorCode = 'PHASE_NOT_ALLOWED' | 'NOT_ACTIVE_PLAYER' | 'DECISION_PENDING' | 'AUCTION_IN_PROGRESS' | 'RENT_PENDING' | 'PAYMENT_PENDING' | 'NOT_A_BUILDABLE_ASSET' | 'NOT_OWNER' | 'GROUP_INCOMPLETE' | 'GROUP_MORTGAGED' | 'MAX_HOUSES' | 'UNEVEN_BUILD' | 'BUILD_QUOTA_USED' | 'INSUFFICIENT_FUNDS' | 'NO_HOUSES' | 'UNEVEN_SALE';
/** House build cost Q(50% × price); a pure display helper shared with the client. */
export function houseCost(price: Money): Money { return quantumRatio(price, 2); }
/** House sale refund Q(50% × cost); a pure display helper shared with the client. */
export function houseRefund(cost: Money): Money { return quantumRatio(cost, 2); }
function common(state: GameState, playerId: PlayerId, assetId: AssetId, allowRent = false): HouseErrorCode | null {
  if (state.phase !== 'playing') return 'PHASE_NOT_ALLOWED';
  // Same precedence as the handler: auction pause before turn ownership.
  if (state.auction) return 'AUCTION_IN_PROGRESS';
  if (state.turn!.playerId !== playerId || state.eliminated.includes(playerId)) return 'NOT_ACTIVE_PLAYER';
  if (state.purchase) return 'DECISION_PENDING';
  if (state.rent && !allowRent) return 'RENT_PENDING';
  if (state.charge && !allowRent) return 'PAYMENT_PENDING';
  if (!state.board!.cells.some(c => c.kind === 'monopoly' && c.asset?.assetId === assetId)) return 'NOT_A_BUILDABLE_ASSET';
  if (state.owners[assetId] !== playerId) return 'NOT_OWNER';
  return null;
}
function groupFor(state: GameState, assetId: AssetId) {
  const asset = state.board!.cells.find(c => c.asset?.assetId === assetId)!.asset!;
  return state.board!.cells.filter(c => c.asset?.groupId === asset.groupId).map(c => c.asset!);
}
export function buildLegality(state: GameState, playerId: PlayerId, assetId: AssetId): HouseErrorCode | null {
  const error = common(state, playerId, assetId); if (error) return error;
  const group = groupFor(state, assetId);
  if (group.some(a => state.owners[a.assetId] !== playerId)) return 'GROUP_INCOMPLETE';
  if (group.some(a => isMortgaged(state, a.assetId))) return 'GROUP_MORTGAGED';
  const houses = state.houses[assetId] ?? 0;
  if (houses >= 4) return 'MAX_HOUSES';
  if (houses !== Math.min(...group.map(a => state.houses[a.assetId] ?? 0))) return 'UNEVEN_BUILD';
  if (state.turn!.quotas.builds < 1) return 'BUILD_QUOTA_USED';
  if (state.balances[playerId]! < houseCost(group.find(a => a.assetId === assetId)!.price)) return 'INSUFFICIENT_FUNDS';
  return null;
}
export function saleLegality(state: GameState, playerId: PlayerId, assetId: AssetId): HouseErrorCode | null {
  const error = common(state, playerId, assetId, true); if (error) return error;
  const houses = state.houses[assetId] ?? 0;
  if (houses < 1) return 'NO_HOUSES';
  if (houses !== Math.max(...groupFor(state, assetId).map(a => state.houses[a.assetId] ?? 0))) return 'UNEVEN_SALE';
  return null;
}
export type BuildHouseCommand = GameCommand<{ readonly assetId: AssetId }, 'BuildHouse'>;
export type SellHouseCommand = GameCommand<{ readonly assetId: AssetId }, 'SellHouse'>;
export type HouseBuilt = GameEvent<{ readonly playerId: PlayerId; readonly assetId: AssetId; readonly houses: number; readonly cost: Money }, 'HouseBuilt'>;
export type HouseSold = GameEvent<{ readonly playerId: PlayerId; readonly assetId: AssetId; readonly houses: number; readonly refund: Money; readonly auto: boolean }, 'HouseSold'>;
export type HouseEvent = HouseBuilt | HouseSold;
/** Sell one house selected in legal even order, without changing quotas. */
export function applyHouseSale(state: GameState, playerId: PlayerId, assetId: AssetId, auto: boolean) {
  const asset = state.board!.cells.find(c => c.asset?.assetId === assetId)!.asset!;
  const refund = houseRefund(houseCost(asset.price));
  const balance = creditBalance(state.balances, playerId, refund, 'house-sale');
  const houses = {...state.houses};
  const count = houses[assetId]! - 1;
  if (count) houses[assetId] = count; else delete houses[assetId];
  const event: HouseSold = {type: 'HouseSold', payload: {playerId, assetId, houses: count, refund, auto}};
  return {state: {...state, houses, balances: balance.balances}, events: [balance.event, event]};
}
export const houseCommands: CommandRegistry = Object.fromEntries(['BuildHouse', 'SellHouse'].map(type => [type, {
  guard: targetGuard('turn', (s: GameState) => s.turn?.turnId ?? null), allowedActors: ['player'], allowedPhases: ['playing'],
  handle(state, command, context) {
    const payload = command.payload;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).length !== 1 || !Object.hasOwn(payload, 'assetId') || typeof (payload as {assetId: unknown}).assetId !== 'string') return fail('INVALID_PAYLOAD', 'Expected {assetId}');
    const assetId = (payload as {assetId: AssetId}).assetId;
    if (state.auction !== null) return fail('AUCTION_IN_PROGRESS', 'Turn is paused for auction');
    if (command.actor.kind !== 'player' || command.actor.id !== state.turn!.playerId) return fail('NOT_ACTIVE_PLAYER', `Turn ${state.turn!.turnId} belongs to ${state.turn!.playerId}`);
    const playerId = command.actor.id;
    if (context.now >= state.turn!.deadline) return fail('DEADLINE_PASSED', 'Turn expired');
    const error = (type === 'BuildHouse' ? buildLegality : saleLegality)(state, playerId, assetId);
    if (error) return fail(error, error);
    if (type === 'SellHouse') { const result = applyHouseSale(state, playerId, assetId, false); return ok(result.state, result.events); }
    const asset = state.board!.cells.find(c => c.asset?.assetId === assetId)!.asset!;
    const cost = houseCost(asset.price);
    const balance = debitBalance(state.balances, playerId, cost, 'build');
    const count = (state.houses[assetId] ?? 0) + 1;
    const event: HouseBuilt = {type: 'HouseBuilt', payload: {playerId, assetId, houses: count, cost}};
    return ok({ ...state, houses: {...state.houses, [assetId]: count}, balances: balance.balances,
      turn: { ...state.turn!, quotas: { ...state.turn!.quotas, builds: state.turn!.quotas.builds - 1 } } }, [balance.event, event]);
  },
} satisfies import('./registry.js').CommandSpec]));
