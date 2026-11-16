import { gameEngine } from '@game/game-core';
import type { Kysely } from 'kysely';
import { systemClock, type Clock } from '../context/clock.js';
import { csprngEntropy, type EntropySource } from '../context/entropy.js';
import { createGameStore, type GameStore } from '../db/game-store.js';
import type { Database } from '../db/schema.js';
import { consoleLogger, errorFields, type Logger } from '../logger.js';
import { createSystemScheduler, type TimerScheduler } from '../timers/scheduler.js';
import { GameRoom, type RoomDeps } from './room.js';
import { RoomManagerClosedError, RoomNotFoundError, type Engine, type Room, type RoomManager } from './types.js';

/** Errors that mean the stored game itself is bad, as opposed to the database being unreachable. */
const DATA_ERRORS = new Set(['ReplayDivergenceError', 'InvariantViolationError', 'CorruptGameDataError']);

export interface RoomManagerDeps {
  readonly db: Kysely<Database>;
  /** Default: the system clock. */
  readonly clock?: Clock;
  /** Default: `setTimeout` against `clock`. */
  readonly scheduler?: TimerScheduler;
  /** Default: `crypto.randomBytes`. */
  readonly entropy?: EntropySource;
  /** Default: JSON lines on the console. */
  readonly logger?: Logger;
  /** Default: the game-core `gameEngine`. */
  readonly engine?: Engine;
  /** Default: the Postgres store over `db`. Tests wrap it to inject write failures. */
  readonly store?: GameStore;
}

export function createRoomManager(deps: RoomManagerDeps): RoomManager {
  const clock = deps.clock ?? systemClock;
  const logger = deps.logger ?? consoleLogger;
  const store = deps.store ?? createGameStore(deps.db);
  const roomDeps: RoomDeps = {
    store,
    clock,
    logger,
    engine: deps.engine ?? gameEngine,
    scheduler: deps.scheduler ?? createSystemScheduler(clock),
    entropy: deps.entropy ?? csprngEntropy,
  };

  const rooms = new Map<string, GameRoom>();
  const loading = new Map<string, Promise<GameRoom>>();
  let closed = false;
  let closing: Promise<void> | null = null;

  /**
   * Load one room and register it. A stored game that is itself bad
   * (divergence, invariant violation, corrupt row) registers a failed room.
   * A database error rejects and registers nothing, so a later `open` can
   * try again.
   */
  function load(gameId: string): Promise<GameRoom> {
    const pending = loading.get(gameId);
    if (pending !== undefined) return pending;
    const promise = (async () => {
      let room: GameRoom;
      try {
        room = await GameRoom.load(gameId, roomDeps);
      } catch (error) {
        const fields = errorFields(error);
        const dataError = fields.errorName !== undefined && DATA_ERRORS.has(String(fields.errorName));
        logger.error('room could not be restored', {
          gameId,
          ...fields,
          ...(typeof (error as { index?: unknown }).index === 'number' ? { tailIndex: (error as { index: number }).index } : {}),
        });
        if (!dataError) throw error;
        room = GameRoom.failed(gameId, roomDeps);
      }
      rooms.set(gameId, room);
      if (closed) await room.close();
      return room;
    })();
    loading.set(gameId, promise);
    const done = (): void => {
      loading.delete(gameId);
    };
    promise.then(done, done);
    return promise;
  }

  return {
    now: () => clock.now(),
    async restoreAll() {
      if (closed) throw new RoomManagerClosedError();
      const ids = await store.listActiveRoomIds();
      const restored: string[] = [];
      const failed: string[] = [];
      for (const id of ids) {
        let room: GameRoom | undefined;
        try {
          room = rooms.get(id) ?? (await load(id));
        } catch {
          // Could not be read (already logged by `load`): reported as failed,
          // not registered, so `open` loads it once the database answers.
        }
        (room === undefined || room.status === 'failed' ? failed : restored).push(id);
      }
      logger.info('rooms restored', { restored: restored.length, failed: failed.length });
      return { restored, failed };
    },

    async open(gameId) {
      if (closed) throw new RoomManagerClosedError();
      const existing = rooms.get(gameId);
      if (existing !== undefined) return existing;
      const pending = loading.get(gameId);
      if (pending !== undefined) return pending;
      if (!(await store.roomExists(gameId))) throw new RoomNotFoundError(gameId);
      if (closed) throw new RoomManagerClosedError();
      return rooms.get(gameId) ?? load(gameId);
    },

    get(gameId): Room | undefined {
      return rooms.get(gameId);
    },

    shutdown() {
      closing ??= (async () => {
        closed = true;
        // Intake stops before this call returns: `close` refuses new commands synchronously.
        const closingRooms = [...rooms.values()].map((room) => room.close());
        // A room still loading closes itself when its load finishes (see `load`).
        await Promise.allSettled([...loading.values()]);
        await Promise.all([...closingRooms, ...[...rooms.values()].map((room) => room.close())]);
        logger.info('room manager shut down', { rooms: rooms.size });
      })();
      return closing;
    },
  };
}
