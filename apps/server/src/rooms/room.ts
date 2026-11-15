import {
  canonicalJson,
  genesis,
  isPlainData,
  pendingDeadlines,
  restoreSession,
  type CommandId,
  type GameCommand,
  type GameState,
  type LogEntry,
  type PendingDeadline,
  type Session,
  type TargetRef,
  type Timestamp,
} from '@game/game-core';
import type { Clock } from '../context/clock.js';
import { entropyHex, type EntropySource } from '../context/entropy.js';
import type { GameStore } from '../db/game-store.js';
import { errorFields, type Logger } from '../logger.js';
import type { TimerScheduler } from '../timers/scheduler.js';
import {
  PERSISTENCE_FAILED,
  ROOM_UNAVAILABLE,
  type Engine,
  type Room,
  type RoomEvent,
  type RoomResult,
  type RoomStatus,
} from './types.js';

/** A snapshot is written at every accepted revision that is a multiple of this. */
export const SNAPSHOT_INTERVAL = 50;
/** A Timeout that did not resolve its deadline is retried no earlier than this much later. */
export const RETRY_FLOOR_MS = 1000;

const UNIQUE_VIOLATION = '23505';

export interface RoomDeps {
  readonly store: GameStore;
  readonly engine: Engine;
  readonly clock: Clock;
  readonly scheduler: TimerScheduler;
  readonly entropy: EntropySource;
  readonly logger: Logger;
}

/** The session's definition of "the same command": everything but the id. */
function fingerprint(command: GameCommand): string {
  return canonicalJson({
    type: command.type,
    actor: command.actor,
    expected: command.expected,
    payload: command.payload,
  });
}

function sameBody(a: GameCommand, b: GameCommand): boolean {
  try {
    return fingerprint(a) === fingerprint(b);
  } catch {
    return false; // not plain data, so not what was stored
  }
}

/** A system `Timeout` naming a target, as issued by a room timer. */
function isTimeout(command: GameCommand): command is GameCommand & { expected: { kind: 'target'; target: TargetRef } } {
  return command.type === 'Timeout' && command.actor.kind === 'system' && command.expected.kind === 'target';
}

const timerKey = (d: PendingDeadline): string => `${d.target.kind}\u0000${d.target.id}\u0000${d.at}`;

async function loadSession(gameId: string, deps: RoomDeps): Promise<Session> {
  const loaded = await deps.store.loadGame(gameId);
  return restoreSession(deps.engine, loaded.snapshot ?? genesis(), loaded.tail);
}

/**
 * One game: a serial executor around a game-core session. Per command it
 * executes, persists, and only then exposes the result (see `execute`).
 * Knows no rules: it reads the revision, the phase and `pendingDeadlines`.
 */
export class GameRoom implements Room {
  readonly gameId: string;
  private readonly deps: RoomDeps;
  /** Null only for a room that failed while loading. */
  private session: Session | null;
  /** Last persisted state; the session runs ahead of it while a write is in flight. */
  private committed: GameState;
  /** Revision of the state subscribers were last given (or could read at load). */
  private emittedRevision: number;
  private currentStatus: RoomStatus;
  private accepting: boolean;
  private tail: Promise<void> = Promise.resolve();
  private closing: Promise<void> | null = null;
  private readonly timers = new Map<string, () => void>();
  private readonly listeners = new Set<(event: RoomEvent) => void>();

  private constructor(gameId: string, deps: RoomDeps, session: Session | null) {
    this.gameId = gameId;
    this.deps = deps;
    this.session = session;
    this.committed = session?.state ?? genesis();
    this.emittedRevision = this.committed.revision;
    this.currentStatus = session === null ? 'failed' : 'live';
    this.accepting = session !== null;
  }

  /**
   * Rebuild the room from its latest snapshot plus the log tail and arm its
   * timers. Rejects when the database cannot be read (any driver error), the
   * rows are corrupt (`CorruptGameDataError`) or the log does not replay
   * (`ReplayDivergenceError`, `InvariantViolationError`).
   */
  static async load(gameId: string, deps: RoomDeps): Promise<GameRoom> {
    const room = new GameRoom(gameId, deps, await loadSession(gameId, deps));
    room.armTimers();
    return room;
  }

  /** A room that could not be loaded: every command is rejected with `ROOM_UNAVAILABLE`. */
  static failed(gameId: string, deps: RoomDeps): GameRoom {
    return new GameRoom(gameId, deps, null);
  }

  get status(): RoomStatus {
    return this.currentStatus;
  }

  get state(): GameState {
    return this.committed;
  }

  subscribe(listener: (event: RoomEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  submit(command: GameCommand): Promise<RoomResult> {
    if (!this.accepting) return Promise.resolve(this.unavailable(command));
    let now: Timestamp;
    try {
      // Arrival time: a slow write of an earlier command must not cost this one its deadline.
      now = this.deps.clock.now();
    } catch (error) {
      this.deps.logger.error('room clock failed', { gameId: this.gameId, ...errorFields(error) });
      return Promise.resolve(this.reject(command, ROOM_UNAVAILABLE, 'The room could not run the command'));
    }
    const run = this.tail.then(() => this.execute(command, now));
    this.tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /** Resolves once every command submitted so far has finished. */
  async idle(): Promise<void> {
    let seen: Promise<void>;
    do {
      seen = this.tail;
      await seen;
    } while (seen !== this.tail);
  }

  /**
   * Clean shutdown: refuse new commands, cancel timers, let submitted
   * commands finish, then snapshot the room if it is still live.
   */
  close(): Promise<void> {
    this.closing ??= (async () => {
      this.accepting = false;
      this.cancelTimers();
      await this.idle();
      if (this.currentStatus !== 'live') return;
      try {
        await this.deps.store.writeSnapshot(this.gameId, this.committed);
      } catch (error) {
        // The log is complete without it; the next boot replays a longer tail.
        this.deps.logger.error('shutdown snapshot failed', { gameId: this.gameId, ...errorFields(error) });
      }
      this.currentStatus = 'closed';
    })();
    return this.closing;
  }

  // ---- Pipeline -------------------------------------------------------------

  /** One queued command. Never throws. */
  private async execute(command: GameCommand, now: Timestamp): Promise<RoomResult> {
    try {
      return await this.run(command, now);
    } catch (error) {
      this.deps.logger.error('room command failed unexpectedly', {
        gameId: this.gameId,
        commandId: command.commandId,
        ...errorFields(error),
      });
      return this.reject(command, ROOM_UNAVAILABLE, 'The room could not run the command');
    }
  }

  private async run(command: GameCommand, now: Timestamp): Promise<RoomResult> {
    const session = this.session;
    if (this.currentStatus !== 'live' || session === null) return this.unavailable(command);

    // 1. Duplicate delivery, decided by the log itself so that it holds
    //    across restarts and for entries older than the latest snapshot.
    //    A payload that is not plain data cannot be in the log; the session rejects it below.
    if (isPlainData(command.payload)) {
      let prior: LogEntry | undefined;
      try {
        prior = await this.deps.store.findEntryByCommandId(this.gameId, command.commandId);
      } catch (error) {
        this.deps.logger.error('command id lookup failed', {
          gameId: this.gameId,
          commandId: command.commandId,
          ...errorFields(error),
        });
        // Nothing was executed, so the session still equals the database and
        // the armed timers stay as they are: a failing command must never be
        // able to push a deadline back. (A Timeout is retried by `onTimer`.)
        return this.reject(command, PERSISTENCE_FAILED, 'The command could not be checked against the log');
      }
      if (prior !== undefined) {
        if (sameBody(prior.command, command)) {
          return {
            kind: 'accepted',
            commandId: command.commandId,
            revision: prior.revision,
            events: prior.events,
            duplicate: true,
          };
        }
        return this.reject(
          command,
          'COMMAND_ID_CONFLICT',
          `Command id "${command.commandId}" was already used for a different command`,
        );
      }
    }

    // 2. Execute. The session advances in memory; nobody can see that yet.
    const previous = this.committed;
    const result = session.submit(command, { now, entropy: this.deps.entropy.next() });
    if (result.kind === 'rejected') {
      return { kind: 'rejected', commandId: command.commandId, revision: previous.revision, error: result.error };
    }
    const entry = session.log[session.log.length - 1];
    if (entry === undefined || entry.revision !== result.revision || result.revision !== previous.revision + 1) {
      // The session answered from its own index although the log has no such
      // command: memory and database disagree.
      return this.recover(command, new Error('session result does not extend the persisted log'));
    }

    // 3. Persist. Game start is observed from the phase; the room decides nothing.
    const started = previous.phase === 'lobby' && result.state.phase !== 'lobby';
    const snapshotDue = started || result.revision % SNAPSHOT_INTERVAL === 0;
    try {
      await this.deps.store.appendEntry(this.gameId, entry, {
        markPlaying: started,
        snapshot: snapshotDue ? result.state : null,
      });
    } catch (error) {
      return this.recover(command, error);
    }

    // 4. Committed: expose the state, re-arm timers, notify, answer.
    this.committed = result.state;
    this.emittedRevision = result.revision;
    this.armTimers();
    this.emit({
      kind: 'update',
      commandId: command.commandId,
      revision: result.revision,
      state: result.state,
      events: result.events,
    });
    return {
      kind: 'accepted',
      commandId: command.commandId,
      revision: result.revision,
      events: result.events,
      duplicate: false,
    };
  }

  /**
   * The accepted command was not persisted, so the advanced session is
   * discarded and the room is rebuilt from the database.
   */
  private async recover(command: GameCommand, cause: unknown): Promise<RoomResult> {
    const conflict = (cause as { code?: unknown } | null)?.code === UNIQUE_VIOLATION;
    this.deps.logger.warn(conflict ? 'log write conflicted with another writer' : 'log write failed', {
      gameId: this.gameId,
      commandId: command.commandId,
      ...errorFields(cause),
    });

    let session: Session;
    try {
      session = await loadSession(this.gameId, this.deps);
    } catch (error) {
      this.fail(`reload after a failed write failed: ${error instanceof Error ? error.message : String(error)}`, error);
      return this.reject(command, PERSISTENCE_FAILED, 'The command could not be persisted');
    }

    this.session = session;
    this.committed = session.state;
    // Timers follow the reloaded state at their real deadlines. Only the
    // deadline of a Timeout that just failed is held back, so that a write
    // that keeps failing is retried once per floor instead of in a hot loop;
    // no other command's failure can delay a deadline.
    this.armTimers(isTimeout(command) ? { target: command.expected.target, notBefore: this.retryFloor() } : undefined);
    if (this.committed.revision !== this.emittedRevision) {
      this.emittedRevision = this.committed.revision;
      this.emit({ kind: 'resync', revision: this.committed.revision, state: this.committed });
    }
    return this.reject(command, PERSISTENCE_FAILED, 'The command could not be persisted');
  }

  private fail(reason: string, cause: unknown): void {
    this.currentStatus = 'failed';
    this.accepting = false;
    this.cancelTimers();
    this.deps.logger.error('room failed', { gameId: this.gameId, reason, ...errorFields(cause) });
    this.emit({ kind: 'failed', reason });
  }

  private reject(command: GameCommand, code: string, message: string): RoomResult {
    return {
      kind: 'rejected',
      commandId: command.commandId,
      revision: this.committed.revision,
      error: { code, message },
    };
  }

  private unavailable(command: GameCommand): RoomResult {
    return this.reject(command, ROOM_UNAVAILABLE, `Room "${this.gameId}" is ${this.accepting ? 'unavailable' : this.describeStop()}`);
  }

  private describeStop(): string {
    return this.currentStatus === 'failed' ? 'failed' : 'closed';
  }

  private emit(event: RoomEvent): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch (error) {
        this.deps.logger.error('room subscriber threw', { gameId: this.gameId, ...errorFields(error) });
      }
    }
  }

  // ---- Timers ---------------------------------------------------------------

  private retryFloor(): Timestamp {
    return (this.deps.clock.now() + RETRY_FLOOR_MS) as Timestamp;
  }

  private cancelTimers(): void {
    for (const cancel of this.timers.values()) cancel();
    this.timers.clear();
  }

  /**
   * Replace all timers by one per pending deadline of the persisted state.
   * `hold` delays the timer of one target, and only that one.
   */
  private armTimers(hold?: { readonly target: TargetRef; readonly notBefore: Timestamp }): void {
    this.cancelTimers();
    if (!this.accepting || this.currentStatus !== 'live') return;
    for (const deadline of pendingDeadlines(this.committed)) {
      const held = hold !== undefined && hold.target.kind === deadline.target.kind && hold.target.id === deadline.target.id;
      this.arm(deadline, held ? hold.notBefore : undefined);
    }
  }

  private arm(deadline: PendingDeadline, notBefore?: Timestamp): void {
    const key = timerKey(deadline);
    this.timers.get(key)?.();
    const at = notBefore !== undefined && notBefore > deadline.at ? notBefore : deadline.at;
    let live = true;
    const cancel = this.deps.scheduler.schedule(at, () => {
      if (!live) return;
      live = false;
      if (this.timers.get(key) === stop) this.timers.delete(key);
      this.onTimer(deadline);
    });
    const stop = (): void => {
      live = false;
      cancel();
    };
    this.timers.set(key, stop);
  }

  private onTimer(deadline: PendingDeadline): void {
    if (!this.accepting || this.currentStatus !== 'live') return;
    let command: GameCommand;
    try {
      if (this.deps.clock.now() < deadline.at) {
        this.arm(deadline); // fired early
        return;
      }
      command = {
        type: 'Timeout',
        // Random, not derived from the target: one turn can time out twice
        // (continuation) and a derived id could be taken by a client first.
        commandId: `timeout-${entropyHex(this.deps.entropy.next())}` as CommandId,
        actor: { kind: 'system' },
        expected: { kind: 'target', target: deadline.target },
        payload: null,
      };
    } catch (error) {
      this.deps.logger.error('timer could not build its Timeout', { gameId: this.gameId, ...errorFields(error) });
      return;
    }
    void this.submit(command).then((result) => {
      if (result.kind === 'accepted' && !result.duplicate) return;
      // A stale Timeout is expected and harmless. But if this deadline is
      // still pending and nothing will fire for it (failed lookup or write,
      // engine fault, colliding id), try again later instead of stalling the game.
      const key = timerKey(deadline);
      const pending = pendingDeadlines(this.committed).some((d) => timerKey(d) === key);
      if (pending && !this.timers.has(key) && this.accepting && this.currentStatus === 'live') {
        this.deps.logger.warn('Timeout did not resolve its deadline; retrying', {
          gameId: this.gameId,
          target: deadline.target,
          ...(result.kind === 'rejected' ? { code: result.error.code } : { duplicate: true }),
        });
        this.arm(deadline, this.retryFloor());
      }
    });
  }
}
