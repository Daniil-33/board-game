import { randomBytes } from 'node:crypto';
import pg from 'pg';
import type { Kysely } from 'kysely';
import { createDb } from '../../db/client.js';
import { migrateToLatest } from '../../db/migrate.js';
import type { Database } from '../../db/schema.js';

const DEFAULT_URL = 'postgres://game:game@127.0.0.1:54329/postgres';

export interface TestDatabase {
  readonly db: Kysely<Database>;
  /** Names of the migrations that ran when the database was created. */
  readonly migrations: readonly string[];
  drop(): Promise<void>;
}

function adminUrl(): string {
  return process.env['TEST_DATABASE_URL'] ?? DEFAULT_URL;
}

async function admin<T>(run: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: adminUrl() });
  try {
    await client.connect();
  } catch (cause) {
    const { host } = new URL(adminUrl());
    throw new Error(
      `Integration tests need a Postgres at ${host} (TEST_DATABASE_URL). ` +
        'Start the local one with: docker compose -f docker-compose.dev.yml up -d --wait',
      { cause },
    );
  }
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

/** A new, migrated database of its own, so test files never share rows. */
export async function createTestDatabase(options: { migrate?: boolean } = {}): Promise<TestDatabase> {
  const name = `test_${randomBytes(8).toString('hex')}`;
  await admin((client) => client.query(`create database ${name}`));
  const url = new URL(adminUrl());
  url.pathname = `/${name}`;
  const db = createDb(url.toString(), { max: 5 });
  const migrations = options.migrate === false ? [] : await migrateToLatest(db);
  return {
    db,
    migrations,
    async drop() {
      await db.destroy();
      await admin((client) => client.query(`drop database if exists ${name} with (force)`));
    },
  };
}

let seq = 0;

/** Insert a guest and a room in status `lobby` created by that guest; returns the room id. */
export async function seedRoom(db: Kysely<Database>, id?: string): Promise<string> {
  const roomId = id ?? `g${++seq}-${randomBytes(4).toString('hex')}`;
  const guestId = `u-${roomId}`;
  await db.insertInto('guests').values({ id: guestId, nickname: 'Host', token_hash: `hash-${guestId}` }).execute();
  await db.insertInto('rooms').values({ id: roomId, creator_id: guestId, status: 'lobby' }).execute();
  await db.insertInto('room_members').values({ room_id: roomId, guest_id: guestId }).execute();
  return roomId;
}

/** The game's log entries in revision order. */
export async function logEntries(db: Kysely<Database>, gameId: string) {
  const rows = await db.selectFrom('game_log').select('entry').where('game_id', '=', gameId).orderBy('revision').execute();
  return rows.map((r) => r.entry);
}

/** Revisions that have a snapshot, ascending. */
export async function snapshotRevisions(db: Kysely<Database>, gameId: string): Promise<number[]> {
  const rows = await db
    .selectFrom('game_snapshots')
    .select('revision')
    .where('game_id', '=', gameId)
    .orderBy('revision')
    .execute();
  return rows.map((r) => r.revision);
}

export async function roomStatus(db: Kysely<Database>, gameId: string): Promise<string | undefined> {
  const row = await db.selectFrom('rooms').select('status').where('id', '=', gameId).executeTakeFirst();
  return row?.status;
}
