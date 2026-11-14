import type { Revision } from './types.js';
import type { TransitionContext } from './context.js';
import type {
  ActorKind,
  TargetRef,
  EngineError,
  GameCommand,
  GameEngine,
  GameEvent,
  RejectedResult,
  TransitionResult,
} from './engine.js';
import type { GameState, Phase } from './state.js';
import { checkInvariants } from './invariants.js';
import { absorbEntropy } from './rng.js';

/** Error codes produced by the engine's envelope checks. */
export type EnvelopeErrorCode =
  | 'UNKNOWN_COMMAND'
  | 'REVISION_MISMATCH'
  | 'TARGET_MISMATCH'
  | 'ACTOR_NOT_ALLOWED'
  | 'UNKNOWN_ACTOR'
  | 'PHASE_NOT_ALLOWED';

export type HandlerResult =
  | { readonly ok: true; readonly state: GameState; readonly events: readonly GameEvent[] }
  | { readonly ok: false; readonly error: EngineError };

/**
 * How a command type protects itself against commands issued from a stale view.
 * - `revision`: the command must name the exact current state revision.
 * - `target`: the command must name the current target of `targetKind`
 *   (e.g. the current turn); the global revision is not checked, and the
 *   handler re-validates against the current state.
 * - `targets`: like `target`, over several kinds: the command must name one of
 *   the state's current targets of `targetKinds` (e.g. a `Timeout` naming
 *   either the current turn or the current order roll).
 */
export type ConcurrencyGuard =
  | { readonly kind: 'revision' }
  | {
      readonly kind: 'target';
      readonly targetKind: string;
      /** Id of the current target of this kind, or null when there is none. */
      currentTarget(state: GameState): string | null;
    }
  | {
      readonly kind: 'targets';
      readonly targetKinds: readonly string[];
      /** Every current target; entries of other kinds are ignored. */
      currentTargets(state: GameState): readonly TargetRef[];
    };

export const revisionGuard: ConcurrencyGuard = Object.freeze({ kind: 'revision' });

/** Guard a command type by the current target of `targetKind` instead of the global revision. */
export function targetGuard(targetKind: string, currentTarget: (state: GameState) => string | null): ConcurrencyGuard {
  return Object.freeze({ kind: 'target', targetKind, currentTarget });
}

/** Guard a command type by any one of the current targets of `targetKinds`. */
export function targetsGuard(
  targetKinds: readonly string[],
  currentTargets: (state: GameState) => readonly TargetRef[],
): ConcurrencyGuard {
  return Object.freeze({ kind: 'targets', targetKinds: Object.freeze([...targetKinds]), currentTargets });
}

/**
 * One command type's contract. Handlers validate their own payload, thread any
 * RNG draws into the state they return, and never touch `revision`.
 */
export interface CommandSpec {
  readonly guard: ConcurrencyGuard;
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

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Step 2 of the check order. Compares structurally and never throws, because
 * `expected` may arrive malformed from an untrusted client.
 */
function checkExpectation(guard: ConcurrencyGuard, expected: unknown, state: GameState): EngineError | null {
  if (guard.kind === 'revision') {
    if (isRecord(expected) && expected.kind === 'revision' && expected.revision === state.revision) return null;
    const seen = isRecord(expected) && expected.kind === 'revision' ? String(expected.revision) : 'a non-revision expectation';
    return { code: 'REVISION_MISMATCH', message: `Expected revision ${seen}, state is at ${state.revision}` };
  }
  if (guard.kind === 'targets') {
    const current = guard.currentTargets(state).filter((t) => guard.targetKinds.includes(t.kind));
    const kinds = guard.targetKinds.join('|');
    if (current.length === 0) {
      return { code: 'TARGET_MISMATCH', message: `No current ${kinds} target` };
    }
    const target = isRecord(expected) && expected.kind === 'target' && isRecord(expected.target) ? expected.target : null;
    if (target !== null && current.some((t) => t.kind === target.kind && t.id === target.id)) return null;
    return {
      code: 'TARGET_MISMATCH',
      message: `Command must target a current ${kinds} target (${current.map((t) => `${t.kind} "${t.id}"`).join(', ')})`,
    };
  }
  const current = guard.currentTarget(state);
  if (current === null) {
    return { code: 'TARGET_MISMATCH', message: `No current ${guard.targetKind} target` };
  }
  const target = isRecord(expected) && expected.kind === 'target' && isRecord(expected.target) ? expected.target : null;
  if (target !== null && target.kind === guard.targetKind && target.id === current) return null;
  return {
    code: 'TARGET_MISMATCH',
    message: `Command must target current ${guard.targetKind} "${current}"`,
  };
}

/**
 * Build a pure engine over a command registry.
 * Check order: type -> expectation (guard) -> actor kind -> membership -> phase -> handler.
 * Context entropy is absorbed into the state RNG between the phase check and the handler.
 */
export function createEngine(registry: CommandRegistry): GameEngine<GameState, GameCommand, GameEvent> {
  return {
    execute(state, command, context): TransitionResult<GameState, GameEvent> {
      const spec = Object.hasOwn(registry, command.type) ? registry[command.type] : undefined;
      if (spec === undefined) {
        return rejected(state, command, 'UNKNOWN_COMMAND', `Unknown command type "${command.type}"`);
      }

      const mismatch = checkExpectation(spec.guard, command.expected, state);
      if (mismatch !== null) {
        return rejected(state, command, mismatch.code, mismatch.message);
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

      // Absorb host entropy before the handler runs, so every accepted state's RNG
      // reflects it. Rejections below return the original `state`, discarding the mix.
      const working: GameState =
        state.rng === null ? state : { ...state, rng: absorbEntropy(state.rng, context.entropy) };

      const result = spec.handle(working, command, context);
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
