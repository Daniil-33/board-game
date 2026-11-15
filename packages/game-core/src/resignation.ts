import type { GameState } from './state.js';
import type { PlayerId } from './types.js';
import type { GameCommand, GameEvent } from './engine.js';
import { fail, ok, revisionGuard, type CommandRegistry } from './registry.js';
import { removeSetupPlayer } from './setup.js';
import { closeTurn } from './turns.js';

/** Any active player may resign, independent of target ownership or deadline. */
export type ResignCommand = GameCommand<null, 'Resign'>;
export type ResignationErrorCode = 'INVALID_PAYLOAD' | 'PLAYER_ELIMINATED';
export type PlayerResignedEvent = GameEvent<{ readonly playerId: PlayerId }, 'PlayerResigned'>;
export type GameEndedEvent = GameEvent<{ readonly winner: PlayerId }, 'GameEnded'>;
export type ResignationEvent = PlayerResignedEvent | GameEndedEvent;

export const resignationCommands: CommandRegistry = {
  Resign: {
    guard: revisionGuard,
    allowedActors: ['player'],
    allowedPhases: ['setup', 'playing'],
    handle(state, command, context) {
      if (command.payload !== null) return fail('INVALID_PAYLOAD', 'Resign requires payload null');
      // The registry checks actor kind and membership before calling this handler.
      if (command.actor.kind !== 'player') return fail('ACTOR_NOT_ALLOWED', 'Resign requires a player');
      const playerId = command.actor.id;
      if (state.eliminated.includes(playerId)) return fail('PLAYER_ELIMINATED', `Player "${playerId}" has resigned`);
      const eliminated = [...state.eliminated, playerId];
      const active = state.players.map((p) => p.id).filter((p) => !eliminated.includes(p));
      const winner = active.length === 1 ? active[0]! : null;
      let next: GameState = {
        ...state, eliminated,
        positions: Object.fromEntries(Object.entries(state.positions).filter(([p]) => p !== playerId)),
        jail: Object.fromEntries(Object.entries(state.jail).filter(([p]) => p !== playerId)),
      };
      const events: GameEvent[] = [{ type: 'PlayerResigned', payload: { playerId } } satisfies PlayerResignedEvent];
      if (state.phase === 'playing') {
        const order = state.order!;
        next = { ...next, order: order.filter((p) => p !== playerId) };
        if (state.turn!.playerId === playerId) {
          const nextPlayer = winner === null ? order[(order.indexOf(playerId) + 1) % order.length]! : null;
          const closed = closeTurn(next, 'resigned', context.now, { nextPlayer });
          next = closed.state;
          events.push(...closed.events);
        }
      }
      if (winner !== null) {
        events.push({ type: 'GameEnded', payload: { winner } } satisfies GameEndedEvent);
        return ok({ ...next, phase: 'finished', winner, setup: null, order: null, turn: null }, events);
      }
      if (state.phase === 'setup') {
        const removed = removeSetupPlayer(next, playerId, context.now);
        if (!removed.ok) return removed;
        return ok(removed.state, [...events, ...removed.events]);
      }
      return ok(next, events);
    },
  },
};
