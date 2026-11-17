import { reactive } from 'vue';
import type { DebtNotice } from '../game/debts';
import type { PlayerId, StateView } from '@game/game-core';
import type { ClientCommandType, CommandFrame } from '@game/protocol';

/** A message for the player: a rejected command or a server error. */
export interface HudMessage {
  readonly id: number;
  readonly code: string;
  readonly message: string;
  /** The type of the rejected command; absent for a server Error frame. */
  readonly commandType?: ClientCommandType;
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
  notices: DebtNotice[];
  /** A transient connection problem (malformed frame). */
  problem: string | null;
  /** A terminal connection notice; reconnecting has stopped. */
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
    notices: [],
    problem: null,
    fatal: null,
  });
}
