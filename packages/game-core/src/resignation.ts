import { removeMortgageParticipant } from './mortgage.js';
import type { GameState, Elimination } from './state.js';
import type { AssetId, Money, PlayerId, Timestamp } from './types.js';
import type { GameCommand, GameEvent } from './engine.js';
import { fail, ok, revisionGuard, type CommandRegistry } from './registry.js';
import { removeSetupPlayer } from './setup.js';
import { resignDuringPurchase } from './purchase-auction.js';
import { resignDuringRent } from './rent.js';
import { closeTurn, finishAuction } from './turns.js';

/** Any active player may resign, independent of target ownership or deadline. */
export type ResignCommand = GameCommand<null, 'Resign'>;
export type ResignationErrorCode = 'INVALID_PAYLOAD' | 'PLAYER_ELIMINATED';
export type PlayerResignedEvent = GameEvent<{ readonly playerId: PlayerId }, 'PlayerResigned'>;
export type GameEndedEvent = GameEvent<{ readonly winner: PlayerId; readonly at: Timestamp; readonly eliminations: readonly Elimination[]; readonly finalBalances: Readonly<Record<string, Money>> }, 'GameEnded'>;
export type AssetsReleased = GameEvent<{readonly playerId: PlayerId; readonly assetIds: readonly AssetId[]; readonly reason: 'resigned' | 'bankrupt'}, 'AssetsReleased'>;
/** Stage 7 adds trade offers; elimination already calls the shared hook. */
export function cancelOffersOf(state: GameState, _playerId: PlayerId): GameState { return state; }
export type ResignationEvent = PlayerResignedEvent | GameEndedEvent | AssetsReleased;

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
      const owners = { ...next.owners }, houses = { ...next.houses }, mortgages = { ...next.mortgages };
      const assetIds = state.board!.cells.flatMap(c => c.asset && Object.hasOwn(owners, c.asset.assetId) && owners[c.asset.assetId] === playerId ? [c.asset.assetId] : []);
      for (const id of assetIds) { delete owners[id]; delete houses[id]; delete mortgages[id]; }
      next = cancelOffersOf(removeMortgageParticipant({ ...next, owners, houses, mortgages,
        eliminations: [...state.eliminations, {playerId, reason: 'resigned', at: context.now, creditorId: null}],
      }, playerId), playerId);
      next = resignDuringRent(next, playerId, winner !== null);
      const events: GameEvent[] = [{ type: 'PlayerResigned', payload: { playerId } } satisfies PlayerResignedEvent, {type: 'AssetsReleased', payload: {playerId, assetIds, reason: 'resigned'}} satisfies AssetsReleased];
      if (state.phase === 'playing') {
        const order = state.order!;
        next = { ...next, order: order.filter((p) => p !== playerId), turn: state.turn!.playerId === playerId ? { ...state.turn!, pendingBonus: false } : state.turn };
        if (winner === null) {
          const acquisition = resignDuringPurchase(next, playerId, context.now, finishAuction);
          next = acquisition.state;
          events.push(...acquisition.events);
        }
        if (state.turn!.playerId === playerId && (winner !== null || (state.auction === null && next.auction === null))) {
          const nextPlayer = winner === null ? order[(order.indexOf(playerId) + 1) % order.length]! : null;
          const closed = closeTurn(next, 'resigned', context.now, { nextPlayer });
          next = closed.state;
          events.push(...closed.events);
        }
      }
      if (winner !== null) {
        events.push({ type: 'GameEnded', payload: { winner, at: context.now, eliminations: next.eliminations, finalBalances: {...next.balances} } } satisfies GameEndedEvent);
        return ok({ ...next, phase: 'finished', winner, finishedAt: context.now, setup: null, order: null, turn: null, purchase: null, auction: null }, events);
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
