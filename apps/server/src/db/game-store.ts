import { sql, type Kysely, type RawBuilder } from 'kysely';
import type { GameState, LogEntry } from '@game/game-core';
import type { Database } from './schema.js';

/** What a room is rebuilt from: the latest snapshot (if any) and every later log entry, in order. */
export interface LoadedGame {
  readonly snapshot: GameState | null;
  readonly tail: readonly LogEntry[];
}

export interface AppendOptions {
  /** Set `rooms.status` to `playing` in the same transaction. */
  readonly markPlaying: boolean;
  /** State to snapshot at the entry's revision in the same transaction, or null. */
  readonly snapshot: GameState | null;
}

/** A stored row that cannot be a log entry or snapshot of its game. */
export class CorruptGameDataError extends Error {
  constructor(gameId: string, detail: string) {
    super(`Stored data of game "${gameId}" is corrupt: ${detail}`);
    this.name = 'CorruptGameDataError';
  }
}

/** Everything a room and its manager need from the database. */
export interface GameStore {
  roomExists(gameId: string): Promise<boolean>;
  /** Ids of rooms with status `lobby` or `playing`. */
  listActiveRoomIds(): Promise<string[]>;
  /** One consistent read of the latest snapshot and the log after it. */
  loadGame(gameId: string): Promise<LoadedGame>;
  findEntryByCommandId(gameId: string, commandId: string): Promise<LogEntry | undefined>;
  /** One transaction: the log row, then the optional status update and snapshot. */
  appendEntry(gameId: string, entry: LogEntry, options: AppendOptions): Promise<void>;
  /** Idempotent: a snapshot that already exists for `state.revision` is kept. */
  writeSnapshot(gameId: string, state: GameState): Promise<void>;
}

/**
 * A JSON value as a jsonb parameter. Sent as text: pg would otherwise encode
 * a top-level JS array as a Postgres array.
 */
function jsonb<T>(value: T): RawBuilder<T> {
  return sql<T>`${JSON.stringify(value)}::jsonb`;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function createGameStore(db: Kysely<Database>): GameStore {
  const insertSnapshot = (executor: Kysely<Database>, gameId: string, state: GameState) =>
    executor
      .insertInto('game_snapshots')
      .values({ game_id: gameId, revision: state.revision, state: jsonb(state) })
      .onConflict((oc) => oc.columns(['game_id', 'revision']).doNothing())
      .execute();

  return {
    async roomExists(gameId) {
      const row = await db.selectFrom('rooms').select('id').where('id', '=', gameId).executeTakeFirst();
      return row !== undefined;
    },

    async listActiveRoomIds() {
      const rows = await db
        .selectFrom('rooms')
        .select('id')
        .where('status', 'in', ['lobby', 'playing'])
        .orderBy('id')
        .execute();
      return rows.map((r) => r.id);
    },

    async loadGame(gameId) {
      const { snapshot, rows } = await db
        .transaction()
        .setIsolationLevel('repeatable read')
        .setAccessMode('read only')
        .execute(async (trx) => {
          const snapshot = await trx
            .selectFrom('game_snapshots')
            .select(['revision', 'state'])
            .where('game_id', '=', gameId)
            .orderBy('revision', 'desc')
            .limit(1)
            .executeTakeFirst();
          const rows = await trx
            .selectFrom('game_log')
            .select(['revision', 'command_id', 'entry'])
            .where('game_id', '=', gameId)
            .where('revision', '>', snapshot?.revision ?? 0)
            .orderBy('revision')
            .execute();
          return { snapshot, rows };
        });

      if (snapshot !== undefined && (!isRecord(snapshot.state) || snapshot.state.revision !== snapshot.revision)) {
        throw new CorruptGameDataError(gameId, `snapshot row ${snapshot.revision} does not hold a state of that revision`);
      }
      for (const row of rows) {
        const entry: unknown = row.entry;
        if (
          !isRecord(entry) ||
          entry.revision !== row.revision ||
          !isRecord(entry.command) ||
          entry.command.commandId !== row.command_id
        ) {
          throw new CorruptGameDataError(gameId, `log row ${row.revision} does not match its entry`);
        }
      }
      return { snapshot: snapshot?.state ?? null, tail: rows.map((r) => r.entry) };
    },

    async findEntryByCommandId(gameId, commandId) {
      const row = await db
        .selectFrom('game_log')
        .select('entry')
        .where('game_id', '=', gameId)
        .where('command_id', '=', commandId)
        .executeTakeFirst();
      return row?.entry;
    },

    async appendEntry(gameId, entry, options) {
      await db.transaction().execute(async (trx) => {
        await trx
          .insertInto('game_log')
          .values({
            game_id: gameId,
            revision: entry.revision,
            command_id: entry.command.commandId,
            entry: jsonb(entry),
          })
          .execute();
        if (options.markPlaying) {
          await trx.updateTable('rooms').set({ status: 'playing' }).where('id', '=', gameId).execute();
        }
        if (options.snapshot !== null) {
          await insertSnapshot(trx, gameId, options.snapshot);
        }
      });
    },

    async writeSnapshot(gameId, state) {
      await insertSnapshot(db, gameId, state);
    },
  };
}
