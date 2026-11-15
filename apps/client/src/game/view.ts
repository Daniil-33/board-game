/**
 * Pure selectors over the server view. They decide what the HUD shows and
 * which buttons are enabled; they never change the view and never compute a
 * game outcome. The server's `Ack` stays the only source of acceptance.
 */
import { SETUP_ROLL_TARGET_KIND, TURN_TARGET_KIND } from '@game/game-core';
import type { Expectation, PlayerId, StateView } from '@game/game-core';
import type { ClientCommandType } from '@game/protocol';

/** The deadline the timer counts to: the order roll's in `setup`, the turn's in `playing`. */
export function activeDeadline(view: StateView | null): number | null {
  if (view === null) return null;
  if (view.phase === 'setup') return view.setup?.deadline ?? null;
  if (view.phase === 'playing') return view.turn?.deadline ?? null;
  return null;
}

/** Time left until `deadline`, never below zero. */
export function remainingMs(deadline: number, now: number): number {
  return Math.max(0, deadline - now);
}

/** Whole seconds left, rounded up, so the display reaches 0 only at the deadline. */
export function remainingSeconds(deadline: number, now: number): number {
  return Math.ceil(remainingMs(deadline, now) / 1000);
}

/** The current roller in `setup`, the turn owner in `playing`. */
export function activePlayerId(view: StateView | null): PlayerId | null {
  if (view === null) return null;
  if (view.phase === 'setup') return view.setup?.playerId ?? null;
  if (view.phase === 'playing') return view.turn?.playerId ?? null;
  return null;
}

/** The target a command of `type` must name, read from the view; null when the view has none. */
export function commandExpectation(view: StateView | null, type: ClientCommandType): Expectation | null {
  if (view === null || type === 'Resign') return null;
  if (type === 'RollForOrder') {
    if (view.phase !== 'setup' || view.setup === null) return null;
    return { kind: 'target', target: { kind: SETUP_ROLL_TARGET_KIND, id: view.setup.setupRollId } };
  }
  if (view.phase !== 'playing' || view.turn === null) return null;
  return { kind: 'target', target: { kind: TURN_TARGET_KIND, id: view.turn.turnId } };
}

export interface ActionContext {
  readonly view: StateView | null;
  /** The viewer's player id. */
  readonly me: PlayerId | null;
  readonly connected: boolean;
  /** Types of the commands sent and not yet acknowledged. */
  readonly pending: readonly ClientCommandType[];
  readonly now: number;
}

/** Commands presented by the turn-action buttons; resignation has its own confirmation. */
export type TurnCommandType = Exclude<ClientCommandType, 'Resign'>;
export type ActionAvailability = Readonly<Record<ClientCommandType, boolean>>;

function allowedByView(view: StateView, me: PlayerId, type: ClientCommandType): boolean {
  if (type === 'Resign') return view.phase === 'setup' || view.phase === 'playing';
  if (type === 'RollForOrder') return view.phase === 'setup' && view.setup?.playerId === me;
  if (view.phase !== 'playing' || view.turn === null || view.turn.playerId !== me) return false;
  return type === 'RollDice' ? !view.turn.rolled : view.turn.rolled;
}

/** Whether the button for `type` is enabled. Greys buttons out only; the server decides. */
export function canIssue(ctx: ActionContext, type: ClientCommandType): boolean {
  const { view, me } = ctx;
  if (view === null || me === null || !ctx.connected) return false;
  if (!view.players.some((p) => p.id === me) || view.eliminated.includes(me)) return false;
  if (ctx.pending.includes(type)) return false;
  if (!allowedByView(view, me, type)) return false;
  if (type === 'Resign') return true;
  const deadline = activeDeadline(view);
  return deadline !== null && ctx.now < deadline;
}

export function actionAvailability(ctx: ActionContext): ActionAvailability {
  return {
    RollForOrder: canIssue(ctx, 'RollForOrder'),
    RollDice: canIssue(ctx, 'RollDice'),
    EndTurn: canIssue(ctx, 'EndTurn'),
    Resign: canIssue(ctx, 'Resign'),
  };
}

export interface OrderEntry {
  readonly playerId: PlayerId;
  readonly active: boolean;
  readonly eliminated: boolean;
  /** Setup only: the player shares an unresolved order-roll group. */
  readonly tied: boolean;
  /**
   * Setup only: the unresolved group came out of a roll that split the players.
   * False in a group of everyone, where the view cannot tell the first round
   * from a reroll after all players tied.
   */
  readonly tieRolled: boolean;
  /** Setup only: the value rolled in the current round, when rolled. */
  readonly roll: number | null;
  /** Interim jail rule: attempts used, when in jail. */
  readonly jail: { readonly attemptsUsed: number } | null;
}

/**
 * Players in the order the HUD lists them: the turn order in `playing`, the
 * order-roll groups (best first) in `setup`, join order otherwise.
 */
export function turnOrder(view: StateView | null): OrderEntry[] {
  if (view === null) return [];
  const active = activePlayerId(view);
  const entry = (playerId: PlayerId, tied: boolean, roll: number | null, tieRolled = false): OrderEntry => ({
    playerId,
    active: playerId === active,
    eliminated: view.eliminated.includes(playerId),
    tied,
    tieRolled,
    roll,
    jail: Object.hasOwn(view.jail, playerId) ? { attemptsUsed: view.jail[playerId]!.attemptsUsed } : null,
  });

  const missing = (ids: readonly PlayerId[]): OrderEntry[] => view.players.filter((p) => !ids.includes(p.id)).map((p) => entry(p.id, false, null));
  if (view.phase === 'playing' && view.order !== null) {
    return [...view.order.map((id) => entry(id, false, null)), ...missing(view.order)];
  }
  if (view.phase === 'setup' && view.setup !== null) {
    const { groups, round } = view.setup;
    return [...groups.flatMap((group) =>
      group.map((id) =>
        entry(id, group.length > 1, Object.hasOwn(round.rolls, id) ? round.rolls[id]! : null, group.length > 1 && groups.length > 1),
      ),
    ), ...missing(groups.flat())];
  }
  return view.players.map((p) => entry(p.id, false, null));
}
