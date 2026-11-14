import type { PlayerId, Timestamp } from './types.js';
import type { GameCommand, GameEvent } from './engine.js';
import { createEngine, fail, ok, type CommandRegistry } from './registry.js';
import { isValidSeed, seedRng } from './rng.js';
import { MAX_PLAYERS, MIN_PLAYERS } from './state.js';

/** Rules versions this engine can run. Bump when transitions or the RNG stream change. */
export const SUPPORTED_RULES_VERSIONS: readonly string[] = ['core-0'];

export type LifecycleErrorCode =
  | 'INVALID_PAYLOAD'
  | 'INVALID_SEED'
  | 'UNSUPPORTED_RULES_VERSION'
  | 'DUPLICATE_PLAYER'
  | 'PLAYER_LIMIT_REACHED'
  | 'NOT_ENOUGH_PLAYERS';

// ---- Commands ---------------------------------------------------------------

export interface CreateGamePayload {
  readonly seed: number;
  readonly rulesVersion: string;
}
export interface AddPlayerPayload {
  readonly playerId: PlayerId;
}

export type CreateGameCommand = GameCommand<CreateGamePayload, 'CreateGame'>;
export type AddPlayerCommand = GameCommand<AddPlayerPayload, 'AddPlayer'>;
export type StartGameCommand = GameCommand<null, 'StartGame'>;
export type LifecycleCommand = CreateGameCommand | AddPlayerCommand | StartGameCommand;

// ---- Events -----------------------------------------------------------------

export type GameCreatedEvent = GameEvent<{ readonly rulesVersion: string; readonly createdAt: Timestamp }, 'GameCreated'>;
export type PlayerAddedEvent = GameEvent<{ readonly playerId: PlayerId }, 'PlayerAdded'>;
export type GameStartedEvent = GameEvent<{ readonly playerIds: readonly PlayerId[] }, 'GameStarted'>;
export type LifecycleEvent = GameCreatedEvent | PlayerAddedEvent | GameStartedEvent;

// ---- Payload helpers --------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// ---- Registry ---------------------------------------------------------------

export const lifecycleCommands: CommandRegistry = {
  CreateGame: {
    allowedActors: ['system'],
    allowedPhases: ['uninitialized'],
    handle(state, command, context) {
      const p = command.payload;
      if (!isRecord(p) || !('seed' in p) || typeof p.rulesVersion !== 'string') {
        return fail('INVALID_PAYLOAD', 'CreateGame requires { seed, rulesVersion: string }');
      }
      if (!isValidSeed(p.seed)) {
        return fail('INVALID_SEED', `Seed must be an integer in [0, 2^32 - 1], got ${String(p.seed)}`);
      }
      if (!SUPPORTED_RULES_VERSIONS.includes(p.rulesVersion)) {
        return fail('UNSUPPORTED_RULES_VERSION', `Rules version "${p.rulesVersion}" is not supported`);
      }
      const event: GameCreatedEvent = {
        type: 'GameCreated',
        payload: { rulesVersion: p.rulesVersion, createdAt: context.now },
      };
      return ok({ ...state, phase: 'lobby', rulesVersion: p.rulesVersion, rng: seedRng(p.seed) }, [event]);
    },
  },

  AddPlayer: {
    allowedActors: ['system'],
    allowedPhases: ['lobby'],
    handle(state, command) {
      const p = command.payload;
      if (!isRecord(p) || typeof p.playerId !== 'string' || p.playerId.length === 0) {
        return fail('INVALID_PAYLOAD', 'AddPlayer requires { playerId: non-empty string }');
      }
      const playerId = p.playerId as PlayerId;
      if (state.players.some((pl) => pl.id === playerId)) {
        return fail('DUPLICATE_PLAYER', `Player "${playerId}" is already in the game`);
      }
      if (state.players.length >= MAX_PLAYERS) {
        return fail('PLAYER_LIMIT_REACHED', `A game holds at most ${MAX_PLAYERS} players`);
      }
      const event: PlayerAddedEvent = { type: 'PlayerAdded', payload: { playerId } };
      return ok({ ...state, players: [...state.players, { id: playerId }] }, [event]);
    },
  },

  StartGame: {
    allowedActors: ['system'],
    allowedPhases: ['lobby'],
    handle(state) {
      if (state.players.length < MIN_PLAYERS) {
        return fail('NOT_ENOUGH_PLAYERS', `At least ${MIN_PLAYERS} players are required, have ${state.players.length}`);
      }
      const event: GameStartedEvent = {
        type: 'GameStarted',
        payload: { playerIds: state.players.map((pl) => pl.id) },
      };
      return ok({ ...state, phase: 'setup' }, [event]);
    },
  },
};

/** The default engine for this rules version. */
export const gameEngine = createEngine(lifecycleCommands);
