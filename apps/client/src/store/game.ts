import { reactive } from 'vue';
import type { PlayerId, StateView } from '@game/game-core';
import type { CommandFrame } from '@game/protocol';

/** A message for the player: a rejected command or a server error. */
export interface HudMessage {
  readonly id: number;
  readonly code: string;
  readonly message: string;
}

export interface GameState {
  /** True between a `Welcome` and the loss of that socket. */
  connected: boolean;
  /** Our player id, as told by `Welcome`. */
  playerId: PlayerId | null;
  /** The latest server view; never changed locally. */
  view: StateView | null;
  /** Commands sent and not yet acknowledged, oldest first. */
  pending: CommandFrame[];
  messages: HudMessage[];
  /** A transient connection problem (malformed frame). */
  problem: string | null;
  /** Set when the client must be reloaded; reconnecting has stopped. */
  fatal: string | null;
}

export const MAX_MESSAGES = 5;

export function createGameState(): GameState {
  return reactive<GameState>({
    connected: false,
    playerId: null,
    view: null,
    pending: [],
    messages: [],
    problem: null,
    fatal: null,
  });
}
