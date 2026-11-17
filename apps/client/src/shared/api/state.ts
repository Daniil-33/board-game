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

export const MAX_MESSAGES = 5;

export interface ConnectionState {
  connected: boolean;
  playerId: PlayerId | null;
  view: StateView | null;
  pending: CommandFrame[];
  messages: HudMessage[];
  problem: string | null;
  fatal: string | null;
}
