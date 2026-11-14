import type { PlayerId, Timestamp } from './types.js';
import type { GameCommand, GameEvent } from './engine.js';
import type { TransitionContext } from './context.js';
import type { GameState, TurnQuotas, TurnState } from './state.js';
import { fail, ok, targetGuard, type CommandRegistry, type HandlerResult } from './registry.js';
import { isNullPayload, rollTwoDice } from './dice.js';
import { movePlayer, PLACEHOLDER_RING, type PlayerMovedEvent } from './board.js';
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

export type TurnEndReason = 'end-turn' | 'timeout' | 'sent-to-jail';

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
export type TurnEvent =
  | TurnStartedEvent
  | DiceRolledEvent
  | PlayerMovedEvent
  | TurnContinuedEvent
  | TurnEndedEvent
  | SentToJailEvent
  | InterimJailEvent;

type Step = { state: GameState; events: TurnEvent[] };

// ---- Turn mechanics ---------------------------------------------------------

/** Open a new turn. Its id derives from the revision the accepting command produces. */
function startTurn(state: GameState, playerId: PlayerId, bonus: boolean, doublesStreak: number, now: Timestamp): Step {
  const turn: TurnState = {
    turnId: `t${state.revision + 1}`,
    playerId,
    deadline: after(now, TURN_DURATION_MS),
    bonus,
    rolled: false,
    continuation: false,
    doublesStreak,
    pendingBonus: false,
    quotas: TURN_QUOTAS,
  };
  return {
    state: { ...state, turn },
    events: [{ type: 'TurnStarted', payload: { turnId: turn.turnId, playerId, deadline: turn.deadline, bonus } }],
  };
}

/** Enter phase `playing`: everyone on the start cell, the first in `order` to move. */
export function startPlay(state: GameState, order: readonly PlayerId[], now: Timestamp): Step {
  const positions: Record<string, number> = {};
  for (const p of order) positions[p] = PLACEHOLDER_RING.startCell;
  return startTurn({ ...state, phase: 'playing', order, positions, jail: {} }, order[0]!, false, 0, now);
}

/**
 * Mandatory settlement before a turn closes. Stage 1 has nothing to settle;
 * later stages (debts, forced decisions) hook in here.
 */
function settleMandatory(state: GameState): Step {
  return { state, events: [] };
}

/** Close the current turn and start the next one (a bonus turn, or the next player's). */
function closeTurn(state: GameState, reason: TurnEndReason, now: Timestamp): Step {
  const settled = settleMandatory(state);
  const turn = settled.state.turn!;
  const events: TurnEvent[] = [
    ...settled.events,
    { type: 'TurnEnded', payload: { turnId: turn.turnId, playerId: turn.playerId, reason } },
  ];
  let next: Step;
  if (turn.pendingBonus) {
    next = startTurn(settled.state, turn.playerId, true, turn.doublesStreak, now);
  } else {
    const order = settled.state.order!;
    const following = order[(order.indexOf(turn.playerId) + 1) % order.length]!;
    next = startTurn(settled.state, following, false, 0, now);
  }
  return { state: next.state, events: [...events, ...next.events] };
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
  const events: TurnEvent[] = [
    { type: 'DiceRolled', payload: { turnId: turn.turnId, playerId, dice, double, auto } },
  ];
  let next: GameState = { ...state, rng };

  if (Object.hasOwn(next.jail, playerId)) {
    // INTERIM_JAIL_RULE: a release attempt; never counts toward the streak, never grants a bonus.
    const attempt = resolveJailAttempt(next, playerId, dice);
    events.push(...attempt.events);
    next = { ...attempt.state, turn: { ...turn, rolled: true, doublesStreak: 0, pendingBonus: false } };
    return { state: next, events, closed: false };
  }

  if (double && turn.doublesStreak + 1 === DOUBLES_TO_JAIL) {
    const from = next.positions[playerId]!;
    const to = PLACEHOLDER_RING.jailCell;
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
  events.push(moved.event);
  next = {
    ...moved.state,
    turn: { ...turn, rolled: true, doublesStreak: double ? turn.doublesStreak + 1 : 0, pendingBonus: double },
  };
  return { state: next, events, closed: false };
}

/** Checks shared by the owner's turn commands, in the documented order after the payload. */
function checkOwnerInTime(state: GameState, command: GameCommand, now: Timestamp): HandlerResult | null {
  const turn = state.turn!;
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
    const closed = closeTurn(state, 'timeout', context.now);
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
      const closed = closeTurn(state, 'end-turn', context.now);
      return ok(closed.state, closed.events);
    },
  },
};
