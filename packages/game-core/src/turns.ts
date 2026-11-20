import { processMortgageBoundary } from './mortgage.js';
import { offerRent, settleRent, settleCharge } from './rent.js';
import { offerPurchase, openAuction, type PurchaseAuctionEvent, type FinishAuction } from './purchase-auction.js';
import type { BalanceChanged } from './money.js';
import type { PlayerId, Timestamp } from './types.js';
import type { GameCommand, GameEvent } from './engine.js';
import type { TransitionContext } from './context.js';
import type { GameState, TurnQuotas, TurnState } from './state.js';
import { fail, ok, targetGuard, type CommandRegistry, type HandlerResult } from './registry.js';
import { isNullPayload, rollTwoDice } from './dice.js';
import { movePlayer, CLASSIC_40, type PlayerMovedEvent } from './board.js';
import { after, CONTINUATION_MS, TURN_DURATION_MS, TURN_TARGET_KIND } from './deadlines.js';
import { resolveJailAttempt, type InterimJailEvent } from './interim-jail.js';

/** Quotas every new turn starts with (one build, two trade offers). */
export const TURN_QUOTAS: TurnQuotas = Object.freeze({ builds: 1, offers: 2 });

/** The third consecutive double sends the player to jail. */
const DOUBLES_TO_JAIL = 3;

// ---- Commands and events ----------------------------------------------------

export type RollDiceCommand = GameCommand<null, 'RollDice'>;
export type EndTurnCommand = GameCommand<null, 'EndTurn'>;
/** System command resolving an expired `turn` or `setupRoll` deadline named in `expected`. */
export type TimeoutCommand = GameCommand<null, 'Timeout'>;

/** Error codes produced by the order-roll and turn handlers. */
export type TurnErrorCode =
  | 'INVALID_PAYLOAD'
  | 'NOT_ACTIVE_PLAYER'
  | 'DEADLINE_PASSED'
  | 'DEADLINE_NOT_REACHED'
  | 'ALREADY_ROLLED'
  | 'ROLL_REQUIRED';

export type TurnEndReason = 'end-turn' | 'timeout' | 'sent-to-jail' | 'resigned' | 'bankrupt';

export type TurnStartedEvent = GameEvent<
  { readonly turnId: string; readonly playerId: PlayerId; readonly deadline: Timestamp; readonly bonus: boolean },
  'TurnStarted'
>;
export type DiceRolledEvent = GameEvent<
  {
    readonly turnId: string;
    readonly playerId: PlayerId;
    readonly dice: readonly [number, number];
    readonly double: boolean;
    readonly auto: boolean;
  },
  'DiceRolled'
>;
export type TurnContinuedEvent = GameEvent<{ readonly turnId: string; readonly deadline: Timestamp }, 'TurnContinued'>;
export type TurnEndedEvent = GameEvent<
  { readonly turnId: string; readonly playerId: PlayerId; readonly reason: TurnEndReason },
  'TurnEnded'
>;
export type SentToJailEvent = GameEvent<
  { readonly playerId: PlayerId; readonly from: number; readonly to: number },
  'SentToJail'
>;
export type { PlayerMovedEvent };
export type TurnEvent = PurchaseAuctionEvent | BalanceChanged
  | TurnStartedEvent
  | DiceRolledEvent
  | PlayerMovedEvent
  | TurnContinuedEvent
  | TurnEndedEvent
  | SentToJailEvent
  | InterimJailEvent;

type Step = { state: GameState; events: GameEvent[] };

// ---- Turn mechanics ---------------------------------------------------------

/** Open a new turn. Its id derives from the revision the accepting command produces. */
function startTurn(state: GameState, playerId: PlayerId, bonus: boolean, doublesStreak: number, now: Timestamp): Step {
  const turn: TurnState = {
    turnId: `t${state.revision + 1}`,
    playerId,
    deadline: after(now, TURN_DURATION_MS),
    pausedRemainingMs: null,
    bonus,
    rolled: false,
    continuation: false,
    doublesStreak,
    pendingBonus: false,
    // Every turn, bonus turns included, starts with the full quotas (owner decision 2026-11-16).
    quotas: TURN_QUOTAS,
  };
  return {
    state: { ...state, turn },
    events: [{ type: 'TurnStarted', payload: { turnId: turn.turnId, playerId, deadline: turn.deadline, bonus } }],
  };
}

/** Enter phase `playing`: everyone on the start cell, the first in `order` to move. */
export function startPlay(state: GameState, order: readonly PlayerId[], now: Timestamp): Step {
  // Object.fromEntries defines own keys, so any player id (even "__proto__") is safe.
  const positions: Record<string, number> = Object.fromEntries(order.map((p) => [p, CLASSIC_40.startCell]));
  return startTurn({ ...state, phase: 'playing', order, positions, jail: {} }, order[0]!, false, 0, now);
}

/** Mandatory settlement before every turn closure. */
function settleMandatory(state: GameState, now: Timestamp) {
  const rent = settleRent(state, true, now);
  if (rent.bankrupt) return rent;
  const charge = settleCharge(rent.state, true, now);
  return {state: charge.state, events: [...rent.events, ...charge.events], bankrupt: charge.bankrupt};
}

export function closeTurn(state: GameState, reason: TurnEndReason, now: Timestamp,
  resignation?: { readonly nextPlayer: PlayerId | null }): Step {
  const turn = state.turn!, order = state.order!;
  const settled = settleMandatory({...state, purchase: null}, now);
  const closed = scheduleAfterSettlement(settled.state, settled.bankrupt ? 'bankrupt' : reason, now, turn, order, resignation);
  return {state: closed.state, events: [...settled.events, ...closed.events]};
}

/** Schedule exactly once after settlement, retaining the pre-elimination order. */
export function scheduleAfterSettlement(state: GameState, reason: TurnEndReason, now: Timestamp,
  turn: TurnState, oldOrder: readonly PlayerId[], resignation?: {readonly nextPlayer: PlayerId | null}): Step {
  const events: GameEvent[] = [{type:'TurnEnded',payload:{turnId:turn.turnId,playerId:turn.playerId,reason}}];
  if (reason === 'bankrupt' && state.order!.length === 1) {
    const winner = state.order![0]!;
    events.push({type:'GameEnded',payload:{winner,at:now,eliminations:state.eliminations,finalBalances:{...state.balances}}} satisfies import('./resignation.js').GameEndedEvent);
    return {state:{...state,phase:'finished',winner,finishedAt:now,setup:null,order:null,turn:null,purchase:null,auction:null,rent:null,charge:null},events};
  }
  if (resignation?.nextPlayer === null) return {state:{...state,turn:null},events};
  const boundary = processMortgageBoundary(state,turn.playerId);
  events.push(...boundary.events);
  let next: Step;
  if (resignation !== undefined) next = startTurn(boundary.state,resignation.nextPlayer,false,0,now);
  else if (reason !== 'bankrupt' && turn.pendingBonus) next = startTurn(boundary.state,turn.playerId,true,turn.doublesStreak,now);
  else {
    const following = oldOrder[(oldOrder.indexOf(turn.playerId)+1)%oldOrder.length]!;
    next = startTurn(boundary.state,following,false,0,now);
  }
  return {state:next.state,events:[...events,...next.events]};
}

/**
 * Roll 2d6 for the turn owner and apply the result. Shared by `RollDice` and
 * the automatic roll of `Timeout`. Returns whether the roll closed the turn.
 */
function applyRoll(state: GameState, now: Timestamp, auto: boolean): Step & { closed: boolean } {
  const turn = state.turn!;
  const playerId = turn.playerId;
  const [dice, rng] = rollTwoDice(state.rng!);
  const double = dice[0] === dice[1];
  const events: GameEvent[] = [
    { type: 'DiceRolled', payload: { turnId: turn.turnId, playerId, dice, double, auto } },
  ];
  let next: GameState = { ...state, rng };

  if (Object.hasOwn(next.jail, playerId)) {
    // INTERIM_JAIL_RULE: a release attempt; never counts toward the streak, never grants a bonus.
    const attempt = resolveJailAttempt(next, playerId, dice);
    events.push(...attempt.events);
    next = { ...attempt.state, turn: { ...turn, rolled: true, doublesStreak: 0, pendingBonus: false } };
    const purchase = offerPurchase(next);
    const rent = Object.hasOwn(purchase.state.jail, playerId) ? { state: purchase.state, events: [] } : offerRent(purchase.state, dice[0] + dice[1]);
    const offered = { state: rent.state, events: [...purchase.events, ...rent.events] };
    return { state: offered.state, events: [...events, ...offered.events], closed: false };
  }

  if (double && turn.doublesStreak + 1 === DOUBLES_TO_JAIL) {
    const from = next.positions[playerId]!;
    const to = CLASSIC_40.jailCell;
    events.push({ type: 'SentToJail', payload: { playerId, from, to } });
    next = {
      ...next,
      positions: { ...next.positions, [playerId]: to },
      jail: { ...next.jail, [playerId]: { attemptsUsed: 0 } },
      turn: { ...turn, rolled: true, doublesStreak: 0, pendingBonus: false },
    };
    const closed = closeTurn(next, 'sent-to-jail', now);
    return { state: closed.state, events: [...events, ...closed.events], closed: true };
  }

  const moved = movePlayer(next, playerId, dice[0] + dice[1]);
  events.push(...moved.events);
  next = {
    ...moved.state,
    turn: { ...turn, rolled: true, doublesStreak: double ? turn.doublesStreak + 1 : 0, pendingBonus: double },
  };
  const purchase = offerPurchase(next);
  const rent = offerRent(purchase.state, dice[0] + dice[1]);
  const offered = { state: rent.state, events: [...purchase.events, ...rent.events] };
  return { state: offered.state, events: [...events, ...offered.events], closed: false };
}

/** Checks shared by the owner's turn commands, in the documented order after the payload. */
function checkOwnerInTime(state: GameState, command: GameCommand, now: Timestamp): HandlerResult | null {
  const turn = state.turn!;
  if (state.auction !== null) return fail('AUCTION_IN_PROGRESS', 'Turn is paused for auction');
  if (command.actor.kind !== 'player' || command.actor.id !== turn.playerId) {
    return fail('NOT_ACTIVE_PLAYER', `Turn ${turn.turnId} belongs to ${turn.playerId}`);
  }
  if (now >= turn.deadline) {
    return fail('DEADLINE_PASSED', `Turn ${turn.turnId} expired at ${turn.deadline}`);
  }
  return null;
}

// ---- Handlers ---------------------------------------------------------------

/**
 * The turn-side branch of `Timeout`. Before the roll: roll for the owner and
 * continue the same turn for `CONTINUATION_MS`. After it: close the turn.
 */
export function turnTimeout(state: GameState, command: GameCommand, context: TransitionContext): HandlerResult {
  if (!isNullPayload(command.payload)) return fail('INVALID_PAYLOAD', 'Timeout requires payload null');
  const turn = state.turn!;
  if (context.now < turn.deadline) {
    return fail('DEADLINE_NOT_REACHED', `Turn ${turn.turnId} is due at ${turn.deadline}`);
  }
  if (turn.rolled) {
    const closed = state.purchase !== null ? openAuction(state, 'timeout', context.now) : closeTurn(state, 'timeout', context.now);
    return ok(closed.state, closed.events);
  }
  const rolled = applyRoll(state, context.now, true);
  if (rolled.closed) return ok(rolled.state, rolled.events);
  const deadline = after(context.now, CONTINUATION_MS);
  const continued: GameState = { ...rolled.state, turn: { ...rolled.state.turn!, deadline, continuation: true } };
  return ok(continued, [...rolled.events, { type: 'TurnContinued', payload: { turnId: turn.turnId, deadline } }]);
}

const turnGuard = targetGuard(TURN_TARGET_KIND, (s) => s.turn?.turnId ?? null);

export const turnCommands: CommandRegistry = {
  RollDice: {
    guard: turnGuard,
    allowedActors: ['player'],
    allowedPhases: ['playing'],
    handle(state, command, context) {
      if (!isNullPayload(command.payload)) return fail('INVALID_PAYLOAD', 'RollDice requires payload null');
      const rejected = checkOwnerInTime(state, command, context.now);
      if (rejected !== null) return rejected;
      if (state.turn!.rolled) return fail('ALREADY_ROLLED', `Turn ${state.turn!.turnId} has already rolled`);
      const rolled = applyRoll(state, context.now, false);
      return ok(rolled.state, rolled.events);
    },
  },

  EndTurn: {
    guard: turnGuard,
    allowedActors: ['player'],
    allowedPhases: ['playing'],
    handle(state, command, context) {
      if (!isNullPayload(command.payload)) return fail('INVALID_PAYLOAD', 'EndTurn requires payload null');
      const rejected = checkOwnerInTime(state, command, context.now);
      if (rejected !== null) return rejected;
      if (!state.turn!.rolled) return fail('ROLL_REQUIRED', `Turn ${state.turn!.turnId} must roll before ending`);
      const closed = state.purchase !== null ? openAuction(state, 'end-turn', context.now) : closeTurn(state, 'end-turn', context.now);
      return ok(closed.state, closed.events);
    },
  },
};

/** Complete every auction through the existing turn closure path. */
export const finishAuction: FinishAuction = (state, auction, now) => {
  const turn = state.turn!;
  if (state.eliminated.includes(turn.playerId)) {
    const index = auction.order.indexOf(turn.playerId);
    const cyclic = [...auction.order.slice(index + 1), ...auction.order.slice(0, index)];
    const nextPlayer = cyclic.find(p => state.order!.includes(p))!;
    return closeTurn(state, 'resigned', now, { nextPlayer });
  }
  if (auction.reason !== 'choice') return closeTurn(state, auction.reason, now);
  const deadline = after(now, turn.pausedRemainingMs!);
  return { state: { ...state, turn: { ...turn, deadline, pausedRemainingMs: null } }, events: [
    { type: 'TurnResumed', payload: { turnId: turn.turnId, deadline } },
  ] };
};
