import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { migrateToLatest } from '../db/migrate.js';
import { createTestDatabase, seedRoom } from './helpers/db.js';
import { useHarness } from './helpers/harness.js';

const h = useHarness();

const entry = (revision: number, commandId: string) =>
  sql`${JSON.stringify({ revision, command: { commandId } })}::jsonb`;

// spec: server/persistence "Schema", "Migrations"
describe('migrations', () => {
  it('create the five tables and both unique indexes on an empty database', async () => {
    expect(h.migrations).toEqual(['0001_init', '0002_lobby']);
    const tables = await sql<{ table_name: string }>`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_name not like 'kysely_%' order by table_name`.execute(h.db);
    expect(tables.rows.map((r) => r.table_name)).toEqual(['game_log', 'game_snapshots', 'guests', 'room_members', 'rooms']);
    const indexes = await sql<{ indexdef: string }>`
      select indexdef from pg_indexes where tablename = 'game_log' order by indexname`.execute(h.db);
    const defs = indexes.rows.map((r) => r.indexdef);
    expect(defs.some((d) => /UNIQUE.*\(game_id, command_id\)/.test(d))).toBe(true);
    expect(defs.some((d) => /UNIQUE.*\(game_id, revision\)/.test(d))).toBe(true);
  });

  it('a second run succeeds and executes nothing', async () => {
    expect(await migrateToLatest(h.db)).toEqual([]);
  });

  it('game_log rejects a second row for a revision or a command id', async () => {
    const gameId = await seedRoom(h.db);
    const insert = (revision: number, commandId: string) =>
      sql`insert into game_log (game_id, revision, command_id, entry)
          values (${gameId}, ${revision}, ${commandId}, ${entry(revision, commandId)})`.execute(h.db);
    await insert(1, 'c1');
    await expect(insert(1, 'c2')).rejects.toMatchObject({ code: '23505', constraint: 'game_log_pkey' });
    await expect(insert(2, 'c1')).rejects.toMatchObject({ code: '23505', constraint: 'game_log_game_id_command_id_key' });
    await insert(2, 'c2');
  });

  it('rooms.status accepts only lobby, playing, finished and closed', async () => {
    const gameId = await seedRoom(h.db);
    for (const status of ['playing', 'finished', 'closed', 'lobby']) {
      await sql`update rooms set status = ${status} where id = ${gameId}`.execute(h.db);
    }
    await expect(sql`update rooms set status = 'archived' where id = ${gameId}`.execute(h.db)).rejects.toMatchObject({
      code: '23514',
      constraint: 'rooms_status_check',
    });
  });

  it('rooms.access_code_hash is nullable', async () => {
    const gameId = await seedRoom(h.db);
    const row = await h.db.selectFrom('rooms').select('access_code_hash').where('id', '=', gameId).executeTakeFirstOrThrow();
    expect(row.access_code_hash).toBeNull();
  });

  // spec: server/persistence "Upgrade from 0001"
  it('0002 upgrades a 0001 database with rooms and keeps them', async () => {
    const test = await createTestDatabase({ migrate: false });
    const only0001 = await mkdtemp(join(tmpdir(), 'mig-0001-'));
    try {
      const migrations = fileURLToPath(new URL('../../migrations/', import.meta.url));
      await copyFile(join(migrations, '0001_init.sql'), join(only0001, '0001_init.sql'));
      expect(await migrateToLatest(test.db, only0001)).toEqual(['0001_init']);
      const lobbyRoom = await seedRoom(test.db);
      const playingRoom = await seedRoom(test.db);
      await sql`update rooms set status = 'playing' where id = ${playingRoom}`.execute(test.db);

      expect(await migrateToLatest(test.db)).toEqual(['0002_lobby']);
      const rows = await test.db.selectFrom('rooms').select(['id', 'status', 'access_code_hash']).orderBy('id').execute();
      expect(rows).toEqual(
        [
          { id: lobbyRoom, status: 'lobby', access_code_hash: null },
          { id: playingRoom, status: 'playing', access_code_hash: null },
        ].sort((a, b) => (a.id < b.id ? -1 : 1)),
      );
      await sql`update rooms set status = 'finished' where id = ${playingRoom}`.execute(test.db);
      await sql`update rooms set status = 'closed' where id = ${lobbyRoom}`.execute(test.db);
    } finally {
      await rm(only0001, { recursive: true, force: true });
      await test.drop();
    }
  });

  it('game rows must reference an existing room', async () => {
    await expect(
      sql`insert into game_log (game_id, revision, command_id, entry) values ('nope', 1, 'c', ${entry(1, 'c')})`.execute(h.db),
    ).rejects.toMatchObject({ code: '23503' });
  });
});
