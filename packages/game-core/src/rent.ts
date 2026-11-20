import type { AssetId, Money, PlayerId } from './types.js';
import type { GameState, RentSettlement } from './state.js';
import type { GameCommand, GameEvent } from './engine.js';
import { settleDebt, type DebtResult } from './debt.js';
import { scheduleAfterSettlement } from './turns.js';
import type { Timestamp } from './types.js';
import type { GeneratedBoard } from './board/generate.js';
import { fail, ok, targetGuard, type CommandRegistry } from './registry.js';

/** All rent and building callers share the persisted mortgage flag. */
export function isMortgaged(state: GameState, assetId: AssetId): boolean { return Object.hasOwn(state.mortgages, assetId); }
export type RentQuote = { readonly kind: 'fixed'; readonly amount: Money } |
  { readonly kind: 'energy'; readonly sumPrices: Money; readonly groupSize: number; readonly holdings: number };
const REGULAR_RENT_PERCENT = [5, 15, 35, 65, 100] as const;
const LOGISTICS_RENT_PERCENT = [0, 5, 10, 20, 40] as const;
const COMPLETE_GROUP_BASE_MULTIPLIER = 2;
export const quantumRatio = (numerator: number, denominator: number): Money => 10 * Math.floor(numerator / (10 * denominator)) as Money;
export function energyRentFor(quote: Extract<RentQuote, { kind: 'energy' }>, diceSum: number): Money {
  return quantumRatio(quote.sumPrices * diceSum * quote.holdings, 200 * quote.groupSize);
}
function quoteFor(state: GameState, assetId: AssetId): RentQuote {
  const cell = state.board?.cells.find(c => c.asset?.assetId === assetId);
  const owner = Object.hasOwn(state.owners, assetId) ? state.owners[assetId] : undefined;
  const zero: RentQuote = { kind: 'fixed', amount: 0 as Money };
  if (!cell?.asset || !owner || isMortgaged(state, assetId)) return zero;
  const group = state.board!.cells.filter(c => c.asset?.groupId === cell.asset!.groupId);
  const holdings = group.filter(c => state.owners[c.asset!.assetId] === owner && !isMortgaged(state, c.asset!.assetId)).length;
  if (cell.kind === 'energy') return { kind: 'energy', sumPrices: group.reduce((n,c) => n + c.asset!.price, 0) as Money, groupSize: group.length, holdings };
  if (cell.kind === 'logistics') return { kind: 'fixed', amount: quantumRatio(cell.asset.price * LOGISTICS_RENT_PERCENT[holdings]!, 100) };
  const houses = state.houses[assetId] ?? 0;
  const base = quantumRatio(cell.asset.price * REGULAR_RENT_PERCENT[houses]!, 100);
  const complete = group.every(c => state.owners[c.asset!.assetId] === owner);
  return { kind: 'fixed', amount: (base * (houses === 0 && complete ? COMPLETE_GROUP_BASE_MULTIPLIER : 1)) as Money };
}

export type RentTier =
  | { readonly kind: 'regular'; readonly houses: number; readonly completeGroup: boolean; readonly amount: Money }
  | { readonly kind: 'logistics'; readonly holdings: number; readonly amount: Money }
  | { readonly kind: 'energy'; readonly holdings: number; readonly diceSum: number; readonly amount: Money };

/** Public rent schedule computed from immutable board data, with no state assumptions. */
export function rentTiers(board: GeneratedBoard | null | undefined, assetId: AssetId): readonly RentTier[] {
  const cell = board?.cells.find(candidate => candidate.asset?.assetId === assetId);
  if (!cell?.asset || (cell.kind !== 'monopoly' && cell.kind !== 'logistics' && cell.kind !== 'energy')) return [];
  const group = board!.cells.filter(candidate => candidate.asset?.groupId === cell.asset!.groupId);
  if (cell.kind === 'logistics') {
    return LOGISTICS_RENT_PERCENT.slice(1, Math.min(group.length, LOGISTICS_RENT_PERCENT.length - 1) + 1).map((percent, index) => ({
      kind: 'logistics' as const, holdings: index + 1,
      amount: quantumRatio(cell.asset!.price * percent, 100),
    }));
  }
  if (cell.kind === 'energy') {
    const sumPrices = group.reduce((sum, candidate) => sum + candidate.asset!.price, 0) as Money;
    return group.flatMap((_, index) => Array.from({ length: 11 }, (_, dieIndex) => ({
      kind: 'energy' as const, holdings: index + 1, diceSum: dieIndex + 2,
      amount: energyRentFor({ kind: 'energy', sumPrices, groupSize: group.length, holdings: index + 1 }, dieIndex + 2),
    })));
  }
  const baseTiers = REGULAR_RENT_PERCENT.map((percent, houses) => ({
    kind: 'regular' as const, houses, completeGroup: false,
    amount: quantumRatio(cell.asset!.price * percent, 100),
  }));
  const groupBase = baseTiers[0]!;
  return [
    groupBase,
    { ...groupBase, completeGroup: true, amount: (groupBase.amount * COMPLETE_GROUP_BASE_MULTIPLIER) as Money },
    ...baseTiers.slice(1),
  ];
}
export function rentFor(state: GameState, assetId: AssetId, diceSum: number | null): Money {
  const quote = quoteFor(state, assetId);
  return quote.kind === 'fixed' ? quote.amount : diceSum === null ? 0 as Money : energyRentFor(quote, diceSum);
}
export function rentQuotes(state: GameState): Readonly<Record<string, RentQuote>> {
  return Object.fromEntries(Object.keys(state.owners).map(id => [id, quoteFor(state, id as AssetId)]));
}
export type RentDue = GameEvent<Omit<RentSettlement, 'cell'>, 'RentDue'>;
export type RentPaid = GameEvent<Pick<RentSettlement, 'payerId' | 'ownerId' | 'assetId' | 'amount'> & { readonly auto: boolean }, 'RentPaid'>;
export type RentEvent = RentDue | RentPaid;
export type PayRentCommand = GameCommand<null, 'PayRent'>;
export function offerRent(state: GameState, diceSum: number): { state: GameState; events: GameEvent[] } {
  const payerId = state.turn!.playerId;
  const cell = state.board!.cells[state.positions[payerId]!]!;
  if (!cell.asset || state.purchase || state.auction || state.rent || state.charge) return { state, events: [] };
  const ownerId = state.owners[cell.asset.assetId];
  const amount = rentFor(state, cell.asset.assetId, diceSum);
  if (!ownerId || ownerId === payerId || amount === 0) return { state, events: [] };
  const rent: RentSettlement = { payerId, ownerId, assetId: cell.asset.assetId, cell: cell.index, kind: cell.kind === 'monopoly' ? 'regular' : cell.kind as 'energy' | 'logistics', amount, diceSum: cell.kind === 'energy' ? diceSum : null };
  const { cell: _cell, ...payload } = rent;
  return { state: { ...state, rent }, events: [{ type: 'RentDue', payload } satisfies RentDue] };
}
export function settleRent(state: GameState, auto: boolean, now: Timestamp): DebtResult {
  if (!state.rent) return { state, events: [], bankrupt: false };
  const { payerId, ownerId, assetId, amount } = state.rent;
  return settleDebt(state, {payerId, creditor: {kind: 'player', id: ownerId}, amount, cause: {kind: 'rent', assetId, auto}}, now);
}

export type ChargeDue = GameEvent<{readonly payerId: PlayerId; readonly amount: Money; readonly cause: 'chance'}, 'ChargeDue'>;
export type ChargePaid = GameEvent<{readonly payerId: PlayerId; readonly amount: Money; readonly auto: boolean}, 'ChargePaid'>;
export type ChargeEvent = ChargeDue | ChargePaid;
export type PayChargeCommand = GameCommand<null, 'PayCharge'>;

/** Open a deterministic mandatory payment owed to the bank. */
export function openCharge(state: GameState, amount: Money, cause: 'chance' = 'chance') {
  if (state.phase !== 'playing' || !state.turn || state.rent || state.charge || !Number.isSafeInteger(amount) || amount <= 0 || amount % 10 !== 0) return { state, events: [] as GameEvent[] };
  const charge = { payerId: state.turn.playerId, amount, cause } as const;
  return { state: { ...state, charge }, events: [{type:'ChargeDue',payload:charge} satisfies ChargeDue] };
}

export function settleCharge(state: GameState, auto: boolean, now: Timestamp): DebtResult {
  if (!state.charge) return {state, events: [], bankrupt: false};
  const {payerId, amount, cause} = state.charge;
  return settleDebt(state, {payerId, creditor: {kind: 'bank'}, amount, cause: {kind: cause, auto}}, now);
}

export const chargeCommands: CommandRegistry = {
  PayCharge: {
    guard: targetGuard('turn', s => s.turn?.turnId ?? null), allowedActors: ['player'], allowedPhases: ['playing'],
    handle(state, command, context) {
      if (command.payload !== null) return fail('INVALID_PAYLOAD', 'PayCharge requires null');
      if (state.auction) return fail('AUCTION_IN_PROGRESS', 'Turn paused');
      if (command.actor.kind !== 'player' || command.actor.id !== state.turn!.playerId) return fail('NOT_ACTIVE_PLAYER', 'Not your turn');
      if (context.now >= state.turn!.deadline) return fail('DEADLINE_PASSED', 'Turn expired');
      if (!state.charge) return fail('NO_CHARGE', 'No pending charge');
      const result = settleCharge(state, false, context.now);
      if (result.bankrupt) {
        const closed = scheduleAfterSettlement(result.state, 'bankrupt', context.now, state.turn!, state.order!);
        return ok(closed.state, [...result.events, ...closed.events]);
      }
      return ok(result.state, result.events);
    },
  },
};
/** Provisional R1/R2; ROADMAP decision is a merge gate. */
export function resignDuringRent(state: GameState, playerId: PlayerId, terminal: boolean): GameState {
  return state.rent && (terminal || state.rent.payerId === playerId || state.rent.ownerId === playerId) ? { ...state, rent: null } : state;
}
/** A bank charge owed by a resigning player is voided before turn closure. */
export function resignDuringCharge(state: GameState, playerId: PlayerId, terminal: boolean): GameState {
  return state.charge && (terminal || state.charge.payerId === playerId) ? { ...state, charge: null } : state;
}
export const rentCommands: CommandRegistry = {
  PayRent: {
    guard: targetGuard('turn', s => s.turn?.turnId ?? null), allowedActors: ['player'], allowedPhases: ['playing'],
    handle(state, command, context) {
      if (command.payload !== null) return fail('INVALID_PAYLOAD', 'PayRent requires null');
      if (state.auction) return fail('AUCTION_IN_PROGRESS', 'Turn paused');
      if (command.actor.kind !== 'player' || command.actor.id !== state.turn!.playerId) return fail('NOT_ACTIVE_PLAYER', 'Not your turn');
      if (context.now >= state.turn!.deadline) return fail('DEADLINE_PASSED', 'Turn expired');
      if (!state.rent) return fail('NO_RENT', 'No pending rent');
      const result = settleRent(state, false, context.now);
      if (result.bankrupt) {
        const closed = scheduleAfterSettlement(result.state, 'bankrupt', context.now, state.turn!, state.order!);
        return ok(closed.state, [...result.events, ...closed.events]);
      }
      return ok(result.state, result.events);
    },
  },
};
