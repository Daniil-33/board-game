import type { ConnectionState } from '../../shared/api/index';
export { MAX_MESSAGES, type HudMessage } from '../../shared/api/index';
import { reactive } from 'vue';
import type { DebtNotice } from './debts';
import type { PlayerId, StateView } from '@game/game-core';
import type { ClientCommandType, CommandFrame } from '@game/protocol';

export interface GameState extends ConnectionState {
  notices: DebtNotice[];

}

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
