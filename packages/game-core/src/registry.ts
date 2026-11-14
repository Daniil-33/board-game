import type { Revision } from './types.js';
import type { TransitionContext } from './context.js';
import type {
  ActorKind,
  EngineError,
  GameCommand,
  GameEngine,
  GameEvent,
  RejectedResult,
  TransitionResult,
} from './engine.js';
import type { GameState, Phase } from './state.js';
import { checkInvariants } from './invariants.js';

/** Error codes produced by the engine's envelope checks. */
export type EnvelopeErrorCode =
  | 'UNKNOWN_COMMAND'
  | 'REVISION_MISMATCH'
  | 'ACTOR_NOT_ALLOWED'
  | 'UNKNOWN_ACTOR'
  | 'PHASE_NOT_ALLOWED';

export type HandlerResult =
  | { readonly ok: true; readonly state: GameState; readonly events: readonly GameEvent[] }
  | { readonly ok: false; readonly error: EngineError };

/**
 * One command type's contract. Handlers validate their own payload, thread any
 * RNG draws into the state they return, and never touch `revision`.
 */
export interface CommandSpec {
  readonly allowedActors: readonly ActorKind[];
  readonly allowedPhases: readonly Phase[];
  handle(state: GameState, command: GameCommand, context: TransitionContext): HandlerResult;
}

export type CommandRegistry = Readonly<Record<string, CommandSpec>>;

export function ok(state: GameState, events: readonly GameEvent[]): HandlerResult {
  return { ok: true, state, events };
}

export function fail(code: string, message: string): HandlerResult {
  return { ok: false, error: { code, message } };
}

function rejected(state: GameState, command: GameCommand, code: string, message: string): RejectedResult<GameState> {
  return {
    kind: 'rejected',
    commandId: command.commandId,
    revision: state.revision,
    state,
    events: [],
    error: { code, message },
  };
}

/**
 * Build a pure engine over a command registry.
 * Check order: type -> revision -> actor kind -> membership -> phase -> handler.
 */
export function createEngine(registry: CommandRegistry): GameEngine<GameState, GameCommand, GameEvent> {
  return {
    execute(state, command, context): TransitionResult<GameState, GameEvent> {
      const spec = Object.hasOwn(registry, command.type) ? registry[command.type] : undefined;
      if (spec === undefined) {
        return rejected(state, command, 'UNKNOWN_COMMAND', `Unknown command type "${command.type}"`);
      }

      if (command.expectedRevision !== state.revision) {
        return rejected(
          state,
          command,
          'REVISION_MISMATCH',
          `Expected revision ${command.expectedRevision}, state is at ${state.revision}`,
        );
      }

      const actor = command.actor;
      if (!spec.allowedActors.includes(actor.kind)) {
        return rejected(state, command, 'ACTOR_NOT_ALLOWED', `Actor kind "${actor.kind}" may not issue ${command.type}`);
      }

      if (actor.kind === 'player' && !state.players.some((p) => p.id === actor.id)) {
        return rejected(state, command, 'UNKNOWN_ACTOR', `Player "${actor.id}" is not in this game`);
      }

      if (!spec.allowedPhases.includes(state.phase)) {
        return rejected(state, command, 'PHASE_NOT_ALLOWED', `${command.type} is not allowed in phase "${state.phase}"`);
      }

      const result = spec.handle(state, command, context);
      if (!result.ok) {
        return rejected(state, command, result.error.code, result.error.message);
      }

      const revision = (state.revision + 1) as Revision;
      const next: GameState = { ...result.state, revision };
      checkInvariants(next);

      return {
        kind: 'accepted',
        commandId: command.commandId,
        previousRevision: state.revision,
        revision,
        state: next,
        events: [...result.events],
      };
    },
  };
}
