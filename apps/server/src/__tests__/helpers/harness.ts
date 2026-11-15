import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import { gameEngine } from '@game/game-core';
import type { Kysely } from 'kysely';
import type { EntropySource } from '../../context/entropy.js';
import { createGameStore, type GameStore } from '../../db/game-store.js';
import type { Database } from '../../db/schema.js';
import type { LogFields, Logger } from '../../logger.js';
import { createRoomManager } from '../../rooms/manager.js';
import { GameRoom } from '../../rooms/room.js';
import type { Engine, RoomEvent, RoomManager, Room } from '../../rooms/types.js';
import { createTestDatabase, type TestDatabase } from './db.js';
import { FakeClock } from './fake-clock.js';
import { T0 } from './game.js';
import { seededEntropy } from './seeded-entropy.js';

export interface LogLine {
  readonly level: 'info' | 'warn' | 'error';
  readonly message: string;
  readonly fields: LogFields;
}

export type MemoryLogger = Logger & { readonly lines: LogLine[] };

export function memoryLogger(): MemoryLogger {
  const lines: LogLine[] = [];
  const at = (level: LogLine['level']) => (message: string, fields: LogFields = {}) => {
    lines.push({ level, message, fields });
  };
  return { lines, info: at('info'), warn: at('warn'), error: at('error') };
}

export interface ContextOptions {
  /** Start of the fake clock; default `T0`. */
  readonly now?: number;
  /** Entropy seed; default 1. */
  readonly seed?: number;
  /** Wrap the real Postgres store, e.g. to delay or fail a write. */
  readonly wrapStore?: (store: GameStore) => GameStore;
  readonly engine?: Engine;
}

export interface Context {
  readonly clock: FakeClock;
  readonly entropy: EntropySource;
  readonly logger: MemoryLogger;
  readonly store: GameStore;
}

export interface Harness {
  readonly db: Kysely<Database>;
  readonly migrations: readonly string[];
  /** A manager with fake time and seeded entropy; shut down after the test. */
  manager(options?: ContextOptions): Context & { readonly manager: RoomManager };
  /** A room loaded without a manager (a second writer); closed after the test. */
  room(gameId: string, options?: ContextOptions): Promise<Context & { readonly room: GameRoom }>;
}

/**
 * Registers hooks that give the test file (or, with `perTest`, each test) its
 * own migrated database and that shut down everything a test created.
 */
export function useHarness(options: { perTest?: boolean } = {}): Harness {
  let current: TestDatabase | undefined;
  const cleanups: (() => Promise<void>)[] = [];

  const setUp = async () => {
    current = await createTestDatabase();
  };
  const tearDown = async () => {
    await current?.drop();
    current = undefined;
  };
  if (options.perTest) {
    beforeEach(setUp);
  } else {
    beforeAll(setUp);
  }
  afterEach(async () => {
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
    if (options.perTest) await tearDown();
  });
  if (!options.perTest) afterAll(tearDown);

  const database = (): TestDatabase => {
    if (current === undefined) throw new Error('test database is not set up');
    return current;
  };

  const context = (opts: ContextOptions): Context => {
    const real = withGuests(database().db, createGameStore(database().db));
    return {
      clock: new FakeClock(opts.now ?? T0),
      entropy: seededEntropy(opts.seed ?? 1),
      logger: memoryLogger(),
      store: opts.wrapStore ? opts.wrapStore(real) : real,
    };
  };

  return {
    get db() {
      return database().db;
    },
    get migrations() {
      return database().migrations;
    },
    manager(opts = {}) {
      const ctx = context(opts);
      const manager = createRoomManager({
        db: database().db,
        clock: ctx.clock,
        scheduler: ctx.clock,
        entropy: ctx.entropy,
        logger: ctx.logger,
        store: ctx.store,
        ...(opts.engine ? { engine: opts.engine } : {}),
      });
      cleanups.push(() => manager.shutdown());
      return { ...ctx, manager };
    },
    async room(gameId, opts = {}) {
      const ctx = context(opts);
      const room = await GameRoom.load(gameId, {
        store: ctx.store,
        clock: ctx.clock,
        scheduler: ctx.clock,
        entropy: ctx.entropy,
        logger: ctx.logger,
        engine: opts.engine ?? gameEngine,
      });
      cleanups.push(() => room.close());
      return { ...ctx, room };
    },
  };
}

/**
 * Room tests use bare player ids ('a', 'b'). `room_members` references
 * `guests`, so before each write this store creates a guest for every player
 * id the write would add (the lobby API only ever adds real guests).
 */
function withGuests(db: Kysely<Database>, store: GameStore): GameStore {
  return {
    ...store,
    async appendEntry(gameId, entry, options) {
      if (options.members !== null && options.members.length > 0) {
        await db
          .insertInto('guests')
          .values(options.members.map((id) => ({ id, nickname: id, token_hash: `test-${id}` })))
          .onConflict((oc) => oc.column('id').doNothing())
          .execute();
      }
      return store.appendEntry(gameId, entry, options);
    },
  };
}

/** Record every event a room emits from now on. */
export function record(room: Room): RoomEvent[] {
  const events: RoomEvent[] = [];
  room.subscribe((event) => events.push(event));
  return events;
}

/** A store whose `appendEntry` waits while the gate is closed. */
export function gatedStore() {
  let gate: Promise<void> | null = null;
  let open: () => void = () => undefined;
  let reached: () => void = () => undefined;
  let entered = new Promise<void>((resolve) => (reached = resolve));
  return {
    wrap: (store: GameStore): GameStore => ({
      ...store,
      async appendEntry(...args) {
        reached();
        if (gate !== null) await gate;
        return store.appendEntry(...args);
      },
    }),
    /** Hold the next writes until `release`. */
    hold(): void {
      entered = new Promise<void>((resolve) => (reached = resolve));
      gate = new Promise<void>((resolve) => (open = resolve));
    },
    /** Resolves when a write has reached the gate. */
    entered: () => entered,
    release(): void {
      gate = null;
      open();
    },
  };
}
