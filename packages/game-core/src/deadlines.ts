import type { Timestamp } from './types.js';
import type { TargetRef } from './engine.js';
import type { GameState } from './state.js';

/** Time a participant has for one order roll. */
export const SETUP_ROLL_DURATION_MS = 45_000;
/** Time a player has for one turn. */
export const TURN_DURATION_MS = 45_000;
/** Extra time after a Timeout rolled for a player who had not rolled. */
export const CONTINUATION_MS = 20_000;

export const AUCTION_RESPONSE_MS = 10_000;
export const AUCTION_RESPONSE_TARGET_KIND = 'auctionResponse';

export const TURN_TARGET_KIND = 'turn';
export const SETUP_ROLL_TARGET_KIND = 'setupRoll';

/** A deadline a `Timeout` command may resolve. */
export interface PendingDeadline {
  readonly target: TargetRef;
  readonly at: Timestamp;
}

/**
 * Every deadline a `Timeout` may resolve in `state`. The host arms one timer
 * per entry and, when it fires, submits `Timeout` naming `target`. Pure.
 */
export function pendingDeadlines(state: GameState): readonly PendingDeadline[] {
  if (state.phase === 'setup' && state.setup !== null) {
    return [{ target: { kind: SETUP_ROLL_TARGET_KIND, id: state.setup.setupRollId }, at: state.setup.deadline }];
  }
  if (state.phase === 'playing' && state.auction !== null) {
    return [{ target: { kind: AUCTION_RESPONSE_TARGET_KIND, id: state.auction.responseId }, at: state.auction.responseDeadline }];
  }
  if (state.phase === 'playing' && state.turn !== null) {
    return [{ target: { kind: TURN_TARGET_KIND, id: state.turn.turnId }, at: state.turn.deadline }];
  }
  return [];
}

/** `now + duration` as a Timestamp. */
export function after(now: Timestamp, durationMs: number): Timestamp {
  return (now + durationMs) as Timestamp;
}
