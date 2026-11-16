import type { AssetId, Money, PlayerId, Timestamp } from './types.js';
import type { GameCommand, GameEvent } from './engine.js';
import type { AuctionState, GameState, PurchaseDecision } from './state.js';
import type { TransitionContext } from './context.js';
import { leaderAfterResignation } from './auction-leader.js';
import { debitBalance } from './money.js';
import { after, AUCTION_RESPONSE_MS, AUCTION_RESPONSE_TARGET_KIND, TURN_TARGET_KIND } from './deadlines.js';
import { fail, ok, targetGuard, type CommandRegistry, type HandlerResult } from './registry.js';

export type BuyAssetCommand = GameCommand<null, 'BuyAsset'>;
export type StartAuctionCommand = GameCommand<null, 'StartAuction'>;
export type BidCommand = GameCommand<null, 'Bid'>;
export type PassAuctionCommand = GameCommand<null, 'PassAuction'>;
export type PurchaseOfferedEvent = GameEvent<PurchaseDecision, 'PurchaseOffered'>;
export type AssetPurchasedEvent = GameEvent<{ readonly playerId: PlayerId; readonly assetId: AssetId; readonly price: Money }, 'AssetPurchased'>;
export type AuctionStartedEvent = GameEvent<AuctionState, 'AuctionStarted'>;
export type AuctionBidEvent = GameEvent<{ readonly auctionId: string; readonly playerId: PlayerId; readonly amount: Money }, 'AuctionBid'>;
export type AuctionPassedEvent = GameEvent<{ readonly auctionId: string; readonly playerId: PlayerId; readonly auto: boolean }, 'AuctionPassed'>;
export type AuctionWonEvent = GameEvent<{ readonly auctionId: string; readonly playerId: PlayerId; readonly assetId: AssetId; readonly amount: Money }, 'AuctionWon'>;
export type AuctionEndedUnsoldEvent = GameEvent<{ readonly auctionId: string; readonly assetId: AssetId }, 'AuctionEndedUnsold'>;
export type TurnPausedEvent = GameEvent<{ readonly turnId: string; readonly pausedRemainingMs: number }, 'TurnPaused'>;
export type TurnResumedEvent = GameEvent<{ readonly turnId: string; readonly deadline: Timestamp }, 'TurnResumed'>;
export type PurchaseAuctionEvent = PurchaseOfferedEvent | AssetPurchasedEvent | AuctionStartedEvent | AuctionBidEvent | AuctionPassedEvent | AuctionWonEvent | AuctionEndedUnsoldEvent | TurnPausedEvent | TurnResumedEvent;
export interface AcquisitionStep { readonly state: GameState; readonly events: readonly GameEvent[] }
/** Turn orchestration supplies the sole closeTurn/resume path, avoiding a module cycle. */
export type FinishAuction = (state: GameState, auction: AuctionState, now: Timestamp) => AcquisitionStep;

export function offerPurchase(state: GameState): AcquisitionStep {
  const playerId = state.turn!.playerId;
  const cell = state.positions[playerId]!;
  const asset = state.board!.cells[cell]!.asset;
  if (!asset || Object.hasOwn(state.owners, asset.assetId)) return { state, events: [] };
  const purchase: PurchaseDecision = { playerId, cell, assetId: asset.assetId };
  return { state: { ...state, purchase }, events: [{ type: 'PurchaseOffered', payload: purchase } satisfies PurchaseOfferedEvent] };
}

export function nextBidAmount(auction: AuctionState): Money {
  return (auction.leadingBid === null ? auction.startBid : auction.leadingBid + auction.step) as Money;
}

export function openAuction(state: GameState, reason: AuctionState['reason'], now: Timestamp): AcquisitionStep {
  const purchase = state.purchase!;
  const price = state.board!.cells[purchase.cell]!.asset!.price;
  const original = state.order!;
  const index = original.indexOf(purchase.playerId);
  const order = [...original.slice(index), ...original.slice(0, index)];
  const auction: AuctionState = {
    auctionId: `a${state.revision + 1}`, assetId: purchase.assetId, cell: purchase.cell, price,
    startBid: (10 * Math.floor(60 * price / 1000)) as Money,
    step: (10 * Math.floor(5 * price / 1000)) as Money,
    reason, order, passed: [], leader: null, leadingBid: null, bids: [],
    responder: order[0]!, responseId: `ar${state.revision + 1}`, responseDeadline: after(now, AUCTION_RESPONSE_MS),
  };
  const pausedRemainingMs = Math.max(0, state.turn!.deadline - now);
  return {
    state: { ...state, purchase: null, auction, turn: { ...state.turn!, pausedRemainingMs } },
    events: [
      { type: 'TurnPaused', payload: { turnId: state.turn!.turnId, pausedRemainingMs } } satisfies TurnPausedEvent,
      { type: 'AuctionStarted', payload: auction } satisfies AuctionStartedEvent,
    ],
  };
}

function eligible(state: GameState, auction: AuctionState, p: PlayerId): boolean {
  return state.order!.includes(p) && !auction.passed.includes(p) && p !== auction.leader;
}

/** Advance only when necessary: unrelated departures preserve the current response timer. */
function advance(state: GameState, now: Timestamp, finish: FinishAuction, preserveResponse = false): AcquisitionStep {
  const a = state.auction!;
  if (!a.order.some(p => eligible(state, a, p))) return resolve(state, now, finish);
  if (preserveResponse && eligible(state, a, a.responder)) return { state, events: [] };
  const index = a.order.indexOf(a.responder);
  for (let offset = 1; offset <= a.order.length; offset++) {
    const responder = a.order[(index + offset) % a.order.length]!;
    if (eligible(state, a, responder)) return {
      state: { ...state, auction: { ...a, responder, responseId: `ar${state.revision + 1}`, responseDeadline: after(now, AUCTION_RESPONSE_MS) } }, events: [],
    };
  }
  throw new Error('Auction has no eligible responder');
}

function resolve(state: GameState, now: Timestamp, finish: FinishAuction): AcquisitionStep {
  const a = state.auction!;
  let next = { ...state, auction: null };
  const events: GameEvent[] = [];
  if (a.leader !== null) {
    const debit = debitBalance(state.balances, a.leader, a.leadingBid!, 'auction');
    next = { ...next, balances: debit.balances, owners: { ...state.owners, [a.assetId]: a.leader } };
    events.push(debit.event, { type: 'AuctionWon', payload: { auctionId: a.auctionId, playerId: a.leader, assetId: a.assetId, amount: a.leadingBid! } } satisfies AuctionWonEvent);
  } else events.push({ type: 'AuctionEndedUnsold', payload: { auctionId: a.auctionId, assetId: a.assetId } } satisfies AuctionEndedUnsoldEvent);
  const ended = finish(next, a, now);
  return { state: ended.state, events: [...events, ...ended.events] };
}

/** E1 provisional policy. Called after elimination/order removal, only for continuing games. */
export function resignDuringPurchase(state: GameState, playerId: PlayerId, now: Timestamp, finish: FinishAuction): AcquisitionStep {
  let next = state.purchase?.playerId === playerId ? { ...state, purchase: null } : state;
  const a = next.auction;
  if (a === null) return { state: next, events: [] };
  const passed = a.passed.includes(playerId) ? a.passed : [...a.passed, playerId];
  const leadership = a.leader === playerId ? leaderAfterResignation(a, next) : { leader: a.leader, leadingBid: a.leadingBid };
  next = { ...next, auction: { ...a, passed, ...leadership } };
  return advance(next, now, finish, true);
}

function pass(state: GameState, now: Timestamp, auto: boolean, finish: FinishAuction): AcquisitionStep {
  const a = state.auction!;
  const advanced = advance({ ...state, auction: { ...a, passed: [...a.passed, a.responder] } }, now, finish);
  return { state: advanced.state, events: [{ type: 'AuctionPassed', payload: { auctionId: a.auctionId, playerId: a.responder, auto } } satisfies AuctionPassedEvent, ...advanced.events] };
}

export function auctionTimeout(state: GameState, command: GameCommand, context: TransitionContext, finish: FinishAuction): HandlerResult {
  if (command.payload !== null) return fail('INVALID_PAYLOAD', 'Timeout requires payload null');
  if (context.now < state.auction!.responseDeadline) return fail('DEADLINE_NOT_REACHED', 'Auction response is not due');
  const step = pass(state, context.now, true, finish);
  return ok(step.state, step.events);
}

export function purchaseAuctionCommands(finish: FinishAuction): CommandRegistry {
  const turnGuard = targetGuard(TURN_TARGET_KIND, s => s.turn?.turnId ?? null);
  const responseGuard = targetGuard(AUCTION_RESPONSE_TARGET_KIND, s => s.auction?.responseId ?? null);
  const purchaseHandler = (buy: boolean) => (state: GameState, command: GameCommand, context: TransitionContext): HandlerResult => {
    if (command.payload !== null) return fail('INVALID_PAYLOAD', 'Purchase commands require payload null');
    if (state.auction !== null) return fail('AUCTION_IN_PROGRESS', 'Turn is paused for auction');
    if (command.actor.kind !== 'player' || command.actor.id !== state.turn!.playerId) return fail('NOT_ACTIVE_PLAYER', 'Not the turn owner');
    if (context.now >= state.turn!.deadline) return fail('DEADLINE_PASSED', 'Turn deadline passed');
    if (state.purchase === null) return fail('NO_PURCHASE', 'No pending purchase');
    if (!buy) { const step = openAuction(state, 'choice', context.now); return ok(step.state, step.events); }
    const p = state.purchase;
    const price = state.board!.cells[p.cell]!.asset!.price;
    if (state.balances[p.playerId]! < price) return fail('INSUFFICIENT_FUNDS', 'Purchase exceeds balance');
    const debit = debitBalance(state.balances, p.playerId, price, 'purchase');
    return ok({ ...state, purchase: null, balances: debit.balances, owners: { ...state.owners, [p.assetId]: p.playerId } }, [debit.event, { type: 'AssetPurchased', payload: { playerId: p.playerId, assetId: p.assetId, price } } satisfies AssetPurchasedEvent]);
  };
  const responseHandler = (bid: boolean) => (state: GameState, command: GameCommand, context: TransitionContext): HandlerResult => {
    if (command.payload !== null) return fail('INVALID_PAYLOAD', 'Auction responses require payload null');
    const a = state.auction!;
    if (command.actor.kind !== 'player' || command.actor.id !== a.responder) return fail('NOT_ACTIVE_PLAYER', 'Not the responder');
    if (context.now >= a.responseDeadline) return fail('DEADLINE_PASSED', 'Response deadline passed');
    if (!bid) { const step = pass(state, context.now, false, finish); return ok(step.state, step.events); }
    const amount = nextBidAmount(a);
    if (!Number.isSafeInteger(amount) || amount > state.balances[a.responder]!) return fail('INSUFFICIENT_FUNDS', 'Bid exceeds balance');
    const step = advance({ ...state, auction: { ...a, leader: a.responder, leadingBid: amount, bids: [...a.bids, { playerId: a.responder, amount }] } }, context.now, finish);
    return ok(step.state, [{ type: 'AuctionBid', payload: { auctionId: a.auctionId, playerId: a.responder, amount } } satisfies AuctionBidEvent, ...step.events]);
  };
  return {
    BuyAsset: { guard: turnGuard, allowedActors: ['player'], allowedPhases: ['playing'], handle: purchaseHandler(true) },
    StartAuction: { guard: turnGuard, allowedActors: ['player'], allowedPhases: ['playing'], handle: purchaseHandler(false) },
    Bid: { guard: responseGuard, allowedActors: ['player'], allowedPhases: ['playing'], handle: responseHandler(true) },
    PassAuction: { guard: responseGuard, allowedActors: ['player'], allowedPhases: ['playing'], handle: responseHandler(false) },
  };
}
