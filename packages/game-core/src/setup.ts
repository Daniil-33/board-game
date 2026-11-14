import type { PlayerId, Timestamp } from './types.js';
import type { GameCommand, GameEvent } from './engine.js';
import type { TransitionContext } from './context.js';
import type { GameState, SetupState } from './state.js';
import { fail, ok, targetGuard, type CommandRegistry, type HandlerResult } from './registry.js';
import { rollDie, isNullPayload } from './dice.js';
import { after, SETUP_ROLL_DURATION_MS, SETUP_ROLL_TARGET_KIND } from './deadlines.js';
import { startPlay, type TurnEvent } from './turns.js';

// ---- Commands and events ----------------------------------------------------

export type RollForOrderCommand = GameCommand<null, 'RollForOrder'>;

export type OrderRollStartedEvent = GameEvent<
  { readonly setupRollId: string; readonly playerId: PlayerId; readonly deadline: Timestamp },
  'OrderRollStarted'
>;
export type OrderDieRolledEvent = GameEvent<
  { readonly playerId: PlayerId; readonly value: number; readonly auto: boolean },
  'OrderDieRolled'
>;
export type OrderTiedEvent = GameEvent<{ readonly playerIds: readonly PlayerId[]; readonly value: number }, 'OrderTied'>;
export type TurnOrderDeterminedEvent = GameEvent<{ readonly order: readonly PlayerId[] }, 'TurnOrderDetermined'>;
export type SetupEvent = OrderRollStartedEvent | OrderDieRolledEvent | OrderTiedEvent | TurnOrderDeterminedEvent;

// ---- Order roll mechanics ---------------------------------------------------

/** Id for a target created by the command that produces `state.revision + 1`. */
function nextSetupRollId(state: GameState): string {
  return `s${state.revision + 1}`;
}

/** Make `pending[0]` the current roller with a fresh target and deadline. */
function openRoll(
  state: GameState,
  groups: SetupState['groups'],
  round: SetupState['round'],
  now: Timestamp,
): { state: GameState; event: OrderRollStartedEvent } {
  const playerId = round.pending[0]!;
  const setup: SetupState = {
    setupRollId: nextSetupRollId(state),
    playerId,
    deadline: after(now, SETUP_ROLL_DURATION_MS),
    groups,
    round,
  };
  return {
    state: { ...state, setup },
    event: { type: 'OrderRollStarted', payload: { setupRollId: setup.setupRollId, playerId, deadline: setup.deadline } },
  };
}

function firstUnresolved(groups: SetupState['groups']): number {
  return groups.findIndex((g) => g.length > 1);
}

/** Start the order roll: one group of every player in join order. Used by StartGame. */
export function beginOrderRoll(state: GameState, now: Timestamp): { state: GameState; events: readonly GameEvent[] } {
  const everyone = state.players.map((p) => p.id);
  const opened = openRoll(state, [everyone], { groupIndex: 0, pending: everyone, rolls: {} }, now);
  return { state: opened.state, events: [opened.event] };
}

/** Roll one die for the current roller and advance the order roll. */
function rollForOrder(state: GameState, now: Timestamp, auto: boolean): HandlerResult {
  const setup = state.setup!;
  const [value, rng] = rollDie(state.rng!);
  const playerId = setup.playerId;
  const events: (SetupEvent | TurnEvent)[] = [{ type: 'OrderDieRolled', payload: { playerId, value, auto } }];
  let next: GameState = { ...state, rng };

  const rolls = { ...setup.round.rolls, [playerId]: value };
  const pending = setup.round.pending.slice(1);
  if (pending.length > 0) {
    const opened = openRoll(next, setup.groups, { groupIndex: setup.round.groupIndex, pending, rolls }, now);
    events.push(opened.event);
    return ok(opened.state, events);
  }

  // The group has rolled: split it by value, descending, keeping stored order within a value.
  const group = setup.groups[setup.round.groupIndex]!;
  const values = [...new Set(group.map((p) => rolls[p]!))].sort((a, b) => b - a);
  const buckets = values.map((v) => group.filter((p) => rolls[p] === v));
  buckets.forEach((bucket, i) => {
    if (bucket.length > 1) events.push({ type: 'OrderTied', payload: { playerIds: bucket, value: values[i]! } });
  });
  const groups = [
    ...setup.groups.slice(0, setup.round.groupIndex),
    ...buckets,
    ...setup.groups.slice(setup.round.groupIndex + 1),
  ];

  const groupIndex = firstUnresolved(groups);
  if (groupIndex >= 0) {
    const members = groups[groupIndex]!;
    const opened = openRoll(next, groups, { groupIndex, pending: members, rolls: {} }, now);
    events.push(opened.event);
    return ok(opened.state, events);
  }

  const order = groups.map((g) => g[0]!);
  events.push({ type: 'TurnOrderDetermined', payload: { order } });
  next = { ...next, setup: null };
  const started = startPlay(next, order, now);
  return ok(started.state, [...events, ...started.events]);
}

// ---- Handlers ---------------------------------------------------------------

/** The setup-side branch of `Timeout`: rolls for the current roller with `auto: true`. */
export function setupTimeout(state: GameState, command: GameCommand, context: TransitionContext): HandlerResult {
  if (!isNullPayload(command.payload)) return fail('INVALID_PAYLOAD', 'Timeout requires payload null');
  const setup = state.setup!;
  if (context.now < setup.deadline) {
    return fail('DEADLINE_NOT_REACHED', `Order roll ${setup.setupRollId} is due at ${setup.deadline}`);
  }
  return rollForOrder(state, context.now, true);
}

export const setupCommands: CommandRegistry = {
  RollForOrder: {
    guard: targetGuard(SETUP_ROLL_TARGET_KIND, (s) => s.setup?.setupRollId ?? null),
    allowedActors: ['player'],
    allowedPhases: ['setup'],
    handle(state, command, context) {
      if (!isNullPayload(command.payload)) return fail('INVALID_PAYLOAD', 'RollForOrder requires payload null');
      const setup = state.setup!;
      if (command.actor.kind !== 'player' || command.actor.id !== setup.playerId) {
        return fail('NOT_ACTIVE_PLAYER', `Only ${setup.playerId} may roll for order now`);
      }
      if (context.now >= setup.deadline) {
        return fail('DEADLINE_PASSED', `Order roll ${setup.setupRollId} expired at ${setup.deadline}`);
      }
      return rollForOrder(state, context.now, false);
    },
  },
};
