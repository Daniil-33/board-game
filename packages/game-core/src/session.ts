import type { Entropy, Revision, Timestamp } from './types.js';
import type { TransitionContext } from './context.js';
import type {
  AcceptedResult,
  GameCommand,
  GameEngine,
  GameEvent,
  RejectedResult,
  TransitionResult,
} from './engine.js';
import { genesis, type GameState } from './state.js';
import { canonicalJson, isPlainData } from './canonical.js';

export type SessionErrorCode = 'INVALID_PAYLOAD' | 'COMMAND_ID_CONFLICT';

/** One accepted command, with everything needed to replay and verify it. */
export interface LogEntry {
  readonly command: GameCommand;
  readonly now: Timestamp;
  readonly entropy: Entropy;
  readonly revision: Revision;
  readonly events: readonly GameEvent[];
}

export interface Session {
  /** Current state; replaced only when a command is accepted. */
  readonly state: GameState;
  /** Accepted commands in acceptance order. Do not mutate. */
  readonly log: readonly LogEntry[];
  submit(command: GameCommand, context: TransitionContext): TransitionResult<GameState, GameEvent>;
}

type Engine = GameEngine<GameState, GameCommand, GameEvent>;

interface IndexEntry {
  readonly fingerprint: string;
  readonly result: AcceptedResult<GameState, GameEvent>;
}

function fingerprint(command: GameCommand): string {
  return canonicalJson({
    type: command.type,
    actor: command.actor,
    expected: command.expected,
    payload: command.payload,
  });
}

/** Detached, frozen copy so later caller-side mutation cannot corrupt the log. */
function snapshot<T>(value: T): T {
  const copy = JSON.parse(canonicalJson(value)) as T;
  const freeze = (v: unknown): void => {
    if (v !== null && typeof v === 'object') {
      Object.freeze(v);
      Object.values(v).forEach(freeze);
    }
  };
  freeze(copy);
  return copy;
}

function rejectAtSession(
  state: GameState,
  command: GameCommand,
  code: SessionErrorCode,
  message: string,
): RejectedResult<GameState> {
  return { kind: 'rejected', commandId: command.commandId, revision: state.revision, state, events: [], error: { code, message } };
}

/**
 * In-memory, deterministic holder of one game's state.
 * Performs no I/O and is safe to drive synchronously from any host.
 */
export function createSession(engine: Engine): Session {
  let state = genesis();
  const log: LogEntry[] = [];
  const index = new Map<string, IndexEntry>();

  return {
    get state() {
      return state;
    },
    get log() {
      return log;
    },
    submit(command, context) {
      if (!isPlainData(command.payload)) {
        return rejectAtSession(state, command, 'INVALID_PAYLOAD', 'Command payload must be plain JSON-compatible data');
      }

      const fp = fingerprint(command);
      const prior = index.get(command.commandId);
      if (prior !== undefined) {
        if (prior.fingerprint === fp) return prior.result;
        return rejectAtSession(
          state,
          command,
          'COMMAND_ID_CONFLICT',
          `Command id "${command.commandId}" was already used for a different command`,
        );
      }

      const result = engine.execute(state, command, context);
      if (result.kind === 'accepted') {
        state = result.state;
        log.push(
          Object.freeze({
            command: snapshot(command),
            now: context.now,
            entropy: snapshot(context.entropy),
            revision: result.revision,
            events: snapshot(result.events),
          }),
        );
        index.set(command.commandId, { fingerprint: fp, result });
      }
      return result;
    },
  };
}

/** Replay failed: the log does not reproduce under this engine. */
export class ReplayDivergenceError extends Error {
  readonly index: number;
  readonly reason: string;
  /** Engine/session error code when the entry was rejected during replay. */
  readonly errorCode: string | undefined;

  constructor(index: number, reason: string, errorCode?: string, options?: { cause?: unknown }) {
    super(`Replay diverged at log entry ${index}: ${reason}`, options);
    this.name = 'ReplayDivergenceError';
    this.index = index;
    this.reason = reason;
    this.errorCode = errorCode;
  }
}

/**
 * Rebuild a live session from genesis by re-submitting every logged command
 * with its recorded time and entropy. Throws ReplayDivergenceError on the first entry that
 * is rejected or yields a different revision or events; no partial session is
 * returned.
 */
export function replay(engine: Engine, entries: readonly LogEntry[]): Session {
  const session = createSession(engine);
  entries.forEach((entry, index) => {
    let result: TransitionResult<GameState, GameEvent>;
    try {
      result = session.submit(entry.command, { now: entry.now, entropy: entry.entropy });
    } catch (cause) {
      throw new ReplayDivergenceError(index, `engine threw: ${String(cause)}`, undefined, { cause });
    }
    if (result.kind === 'rejected') {
      throw new ReplayDivergenceError(index, `command rejected with ${result.error.code}`, result.error.code);
    }
    if (result.revision !== entry.revision) {
      throw new ReplayDivergenceError(index, `revision ${result.revision} != recorded ${entry.revision}`);
    }
    if (canonicalJson(result.events) !== canonicalJson(entry.events)) {
      throw new ReplayDivergenceError(index, 'events differ from recorded events');
    }
  });
  return session;
}
