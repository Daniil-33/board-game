import { generateBoard, type BoardGenerated } from './board/generate.js';
import { startingCapital, lapReward, creditBalance, type BalanceChanged } from './money.js';
import type { PlayerId, Timestamp } from './types.js';
import type { GameCommand, GameEvent } from './engine.js';
import { fail, ok, revisionGuard, type CommandRegistry } from './registry.js';
import { absorbEntropy, isValidSeed, seedRng } from './rng.js';
import { MAX_PLAYERS, MIN_PLAYERS } from './state.js';
import { beginOrderRoll } from './setup.js';

/** Rules versions this engine can run. Bump when transitions or the RNG stream change. */
export const CURRENT_RULES_VERSION = 'core-4';
export const SUPPORTED_RULES_VERSIONS: readonly string[] = [CURRENT_RULES_VERSION];

export type LifecycleErrorCode =
  | 'INVALID_PAYLOAD'
  | 'INVALID_SEED'
  | 'UNSUPPORTED_RULES_VERSION'
  | 'DUPLICATE_PLAYER'
  | 'PLAYER_LIMIT_REACHED'
  | 'NOT_ENOUGH_PLAYERS'
  | 'PLAYER_NOT_FOUND';

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
export type LeaveLobbyPayload = AddPlayerPayload;
export type LeaveLobbyCommand = GameCommand<LeaveLobbyPayload, 'LeaveLobby'>;
export type StartGameCommand = GameCommand<null, 'StartGame'>;
export type LifecycleCommand = CreateGameCommand | AddPlayerCommand | StartGameCommand | LeaveLobbyCommand;

// ---- Events -----------------------------------------------------------------

export type GameCreatedEvent = GameEvent<{ readonly rulesVersion: string; readonly createdAt: Timestamp }, 'GameCreated'>;
export type PlayerAddedEvent = GameEvent<{ readonly playerId: PlayerId }, 'PlayerAdded'>;
export type GameStartedEvent = GameEvent<{ readonly playerIds: readonly PlayerId[] }, 'GameStarted'>;
export type PlayerLeftLobbyEvent = GameEvent<{ readonly playerId: PlayerId }, 'PlayerLeftLobby'>;
export type LifecycleEvent = BoardGenerated | BalanceChanged | GameCreatedEvent | PlayerAddedEvent | GameStartedEvent | PlayerLeftLobbyEvent;

// ---- Payload helpers --------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// ---- Registry ---------------------------------------------------------------

export const lifecycleCommands: CommandRegistry = {
  CreateGame: {
    guard: revisionGuard,
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
      const generated = generateBoard(absorbEntropy(seedRng(p.seed), context.entropy));
      const {cells: _cells, ...metadata} = generated.board;
      return ok({ ...state, phase: 'lobby', rulesVersion: p.rulesVersion, ...generated }, [event, {type: 'BoardGenerated', payload: metadata}]);
    },
  },

  AddPlayer: {
    guard: revisionGuard,
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

  LeaveLobby: {
    guard: revisionGuard,
    allowedActors: ['system'],
    allowedPhases: ['lobby'],
    handle(state, command) {
      const p = command.payload;
      if (!isRecord(p) || typeof p.playerId !== 'string' || p.playerId.length === 0) {
        return fail('INVALID_PAYLOAD', 'LeaveLobby requires { playerId: non-empty string }');
      }
      const playerId = p.playerId as PlayerId;
      if (!state.players.some((pl) => pl.id === playerId)) return fail('PLAYER_NOT_FOUND', `Player "${playerId}" is absent`);
      const event: PlayerLeftLobbyEvent = { type: 'PlayerLeftLobby', payload: { playerId } };
      return ok({ ...state, players: state.players.filter((pl) => pl.id !== playerId) }, [event]);
    },
  },

  StartGame: {
    guard: revisionGuard,
    allowedActors: ['system'],
    allowedPhases: ['lobby'],
    handle(state, _command, context) {
      if (state.players.length < MIN_PLAYERS) {
        return fail('NOT_ENOUGH_PLAYERS', `At least ${MIN_PLAYERS} players are required, have ${state.players.length}`);
      }
      const event: GameStartedEvent = {
        type: 'GameStarted',
        payload: { playerIds: state.players.map((pl) => pl.id) },
      };
      const capital = startingCapital(state.players.length);
      let balances = state.balances;
      const credits: BalanceChanged[] = [];
      for (const player of state.players) {
        const credited = creditBalance(balances, player.id, capital, 'starting-capital');
        balances = credited.balances; credits.push(credited.event);
      }
      const opened = beginOrderRoll({ ...state, phase: 'setup', balances, economy: {startingCapital: capital, lapReward: lapReward(capital)} }, context.now);
      return ok(opened.state, [event, ...credits, ...opened.events]);
    },
  },
};
