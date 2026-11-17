import type { AssetId, Money, PlayerId } from './types.js';
import type { GameState, Mortgage } from './state.js';
import type { GameCommand, GameEvent } from './engine.js';
import { creditBalance, debitBalance } from './money.js';
import { isMortgaged, quantumRatio } from './rent.js';
import { fail, ok, targetGuard, type CommandRegistry, type CommandSpec } from './registry.js';

export type MortgageErrorCode = 'PHASE_NOT_ALLOWED' | 'AUCTION_IN_PROGRESS' | 'NOT_ACTIVE_PLAYER' |
  'DECISION_PENDING' | 'RENT_PENDING' | 'NOT_AN_ASSET' | 'NOT_OWNER' |
  'ALREADY_MORTGAGED' | 'HAS_HOUSES' | 'NOT_MORTGAGED' | 'INSUFFICIENT_FUNDS';

/** Q(50% price), shared with display and liquidation callers. */
export function mortgageAdvance(price: Money): Money { return quantumRatio(price, 2); }

function common(state: GameState, playerId: PlayerId, assetId: AssetId, redeem: boolean): MortgageErrorCode | null {
  if (state.phase !== 'playing') return 'PHASE_NOT_ALLOWED';
  if (state.auction) return 'AUCTION_IN_PROGRESS';
  if (state.turn!.playerId !== playerId || state.eliminated.includes(playerId)) return 'NOT_ACTIVE_PLAYER';
  if (state.purchase) return 'DECISION_PENDING';
  if (redeem && state.rent) return 'RENT_PENDING';
  if (!state.board!.cells.some(c => c.asset?.assetId === assetId)) return 'NOT_AN_ASSET';
  if (!Object.hasOwn(state.owners, assetId) || state.owners[assetId] !== playerId) return 'NOT_OWNER';
  return null;
}
export function mortgageLegality(state: GameState, playerId: PlayerId, assetId: AssetId): MortgageErrorCode | null {
  const error = common(state, playerId, assetId, false); if (error) return error;
  if (isMortgaged(state, assetId)) return 'ALREADY_MORTGAGED';
  if ((state.houses[assetId] ?? 0) > 0) return 'HAS_HOUSES';
  return null;
}
export function redeemLegality(state: GameState, playerId: PlayerId, assetId: AssetId): MortgageErrorCode | null {
  const error = common(state, playerId, assetId, true); if (error) return error;
  if (!isMortgaged(state, assetId)) return 'NOT_MORTGAGED';
  if (state.balances[playerId]! < state.mortgages[assetId]!.advance) return 'INSUFFICIENT_FUNDS';
  return null;
}

export type MortgageCommand = GameCommand<{ readonly assetId: AssetId }, 'Mortgage'>;
export type RedeemCommand = GameCommand<{ readonly assetId: AssetId }, 'Redeem'>;
export type AssetMortgaged = GameEvent<{ readonly playerId: PlayerId; readonly assetId: AssetId; readonly advance: Money; readonly auto: boolean }, 'AssetMortgaged'>;
export type AssetRedeemed = GameEvent<{ readonly playerId: PlayerId; readonly assetId: AssetId; readonly amount: Money }, 'AssetRedeemed'>;
export type MortgageExpired = GameEvent<{ readonly playerId: PlayerId; readonly assetId: AssetId; readonly advance: Money }, 'MortgageExpired'>;
export type MortgageEvent = AssetMortgaged | AssetRedeemed | MortgageExpired;

/** Apply one legal mortgage; command guards belong to the caller. */
export function applyMortgage(state: GameState, playerId: PlayerId, assetId: AssetId, auto: boolean) {
  const advance = mortgageAdvance(state.board!.cells.find(c => c.asset?.assetId === assetId)!.asset!.price);
  const balance = creditBalance(state.balances, playerId, advance, 'mortgage');
  const event: AssetMortgaged = {type: 'AssetMortgaged', payload: {playerId, assetId, advance, auto}};
  return {state: {...state, balances: balance.balances, mortgages: {...state.mortgages,
    [assetId]: {advance, lapsCompleted: 0, pending: [...state.order!]}}}, events: [balance.event, event]};
}

export const mortgageCommands: CommandRegistry = Object.fromEntries(['Mortgage', 'Redeem'].map(type => [type, {
  guard: targetGuard('turn', s => s.turn?.turnId ?? null), allowedActors: ['player'], allowedPhases: ['playing'],
  handle(state, command, context) {
    const p = command.payload;
    if (!p || typeof p !== 'object' || Array.isArray(p) || Object.keys(p).length !== 1 || !Object.hasOwn(p, 'assetId') || typeof (p as {assetId: unknown}).assetId !== 'string') return fail('INVALID_PAYLOAD', 'Expected {assetId}');
    const assetId = (p as {assetId: AssetId}).assetId;
    if (state.auction) return fail('AUCTION_IN_PROGRESS', 'Turn is paused for auction');
    if (command.actor.kind !== 'player' || command.actor.id !== state.turn!.playerId) return fail('NOT_ACTIVE_PLAYER', 'Not your turn');
    const playerId = command.actor.id;
    if (context.now >= state.turn!.deadline) return fail('DEADLINE_PASSED', 'Turn expired');
    const redeem = type === 'Redeem';
    const error = (redeem ? redeemLegality : mortgageLegality)(state, playerId, assetId);
    if (error) return fail(error, error);
    if (!redeem) { const result = applyMortgage(state, playerId, assetId, false); return ok(result.state, result.events); }
    const mortgages = { ...state.mortgages };
    const amount = mortgages[assetId]!.advance;
    const balance = debitBalance(state.balances, playerId, amount, 'redeem');
    delete mortgages[assetId];
    const event: AssetRedeemed = {type: 'AssetRedeemed', payload: {playerId, assetId, amount}};
    return ok({ ...state, mortgages, balances: balance.balances }, [balance.event, event]);
  },
} satisfies CommandSpec]));

/** Only closeTurn calls this: elimination can empty pending without completing a lap. */
export function processMortgageBoundary(state: GameState, closingPlayer: PlayerId): {state: GameState; events: MortgageExpired[]} {
  const mortgages = { ...state.mortgages };
  const owners = { ...state.owners };
  const events: MortgageExpired[] = [];
  for (const cell of state.board!.cells) {
    const assetId = cell.asset?.assetId;
    if (!assetId || !Object.hasOwn(mortgages, assetId)) continue;
    const term = mortgages[assetId]!;
    const pending = term.pending.filter(p => p !== closingPlayer);
    const lapsCompleted = term.lapsCompleted + (pending.length === 0 ? 1 : 0);
    if (lapsCompleted === 8) {
      events.push({type: 'MortgageExpired', payload: {playerId: owners[assetId]!, assetId, advance: term.advance}});
      delete mortgages[assetId]; delete owners[assetId];
    } else mortgages[assetId] = { ...term, lapsCompleted, pending: pending.length ? pending : [...state.order!] };
  }
  return {state: {...state, mortgages, owners}, events};
}

export function removeMortgageParticipant(state: GameState, playerId: PlayerId): GameState {
  const mortgages: Record<string, Mortgage> = Object.fromEntries(Object.entries(state.mortgages).map(([id, term]) => [id, {...term, pending: term.pending.filter(p => p !== playerId)}]));
  return {...state, mortgages};
}
