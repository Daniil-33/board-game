import type { BalanceChanged } from './money.js';
/**
 * TEMPORARY: the interim stage 1 jail rule (release attempts without fees).
 *
 * On each of up to three own turns the prisoner rolls. A double releases them
 * and they move by its sum, with no bonus turn. After the third failed roll
 * they leave anyway and move by that roll's sum. Stage 6 replaces this file
 * with the final jail rules (fees, voluntary exit); delete it then.
 */
import type { PlayerId } from './types.js';
import type { GameEvent } from './engine.js';
import type { GameState } from './state.js';
import { movePlayer, type PlayerMovedEvent } from './board.js';

export const INTERIM_JAIL_RULE = Object.freeze({
  temporary: true,
  replacedInStage: 6,
  maxAttempts: 3,
} as const);

export type InterimJailAttemptFailedEvent = GameEvent<
  { readonly playerId: PlayerId; readonly attemptsUsed: number },
  'InterimJailAttemptFailed'
>;
export type InterimJailReleasedEvent = GameEvent<
  { readonly playerId: PlayerId; readonly reason: 'double' | 'attempts-exhausted' },
  'InterimJailReleased'
>;
export type InterimJailEvent = InterimJailAttemptFailedEvent | InterimJailReleasedEvent;

/**
 * Resolve one release attempt by a prisoner who rolled `dice`. Never grants a
 * bonus turn and never touches the doubles streak; the caller handles both.
 */
export function resolveJailAttempt(
  state: GameState,
  playerId: PlayerId,
  dice: readonly [number, number],
): { state: GameState; events: readonly (InterimJailEvent | PlayerMovedEvent | BalanceChanged)[] } {
  const attemptsUsed = state.jail[playerId]!.attemptsUsed + 1;
  const isDouble = dice[0] === dice[1];
  if (!isDouble && attemptsUsed < INTERIM_JAIL_RULE.maxAttempts) {
    return {
      state: { ...state, jail: { ...state.jail, [playerId]: { attemptsUsed } } },
      events: [{ type: 'InterimJailAttemptFailed', payload: { playerId, attemptsUsed } }],
    };
  }
  const { [playerId]: _released, ...jail } = state.jail;
  const released: InterimJailReleasedEvent = {
    type: 'InterimJailReleased',
    payload: { playerId, reason: isDouble ? 'double' : 'attempts-exhausted' },
  };
  const moved = movePlayer({ ...state, jail }, playerId, dice[0] + dice[1]);
  return { state: moved.state, events: [released, ...moved.events] };
}
