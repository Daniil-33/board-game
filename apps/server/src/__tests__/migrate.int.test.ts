import { copyFile, mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { createSession, gameEngine, CURRENT_RULES_VERSION, timestamp, entropy } from '@game/game-core';
import { sys } from './helpers/game.js';
import { migrateToLatest } from '../db/migrate.js';
import { createTestDatabase, seedRoom } from './helpers/db.js';
import { useHarness } from './helpers/harness.js';

const h = useHarness();
const legacy = JSON.parse(await readFile(new URL('./fixtures/core3.json', import.meta.url), 'utf8'));

const stage2 = JSON.parse(await readFile(new URL('./fixtures/core4.json', import.meta.url), 'utf8'));

const entry = (revision: number, commandId: string) =>
  sql`${JSON.stringify({ revision, command: { commandId } })}::jsonb`;

// spec: server/persistence "Schema", "Migrations"
describe('migrations', () => {
  it('create the five tables and both unique indexes on an empty database', async () => {
    expect(h.migrations).toEqual(['0001_init', '0002_lobby', '0003_stage2_rules', '0004_stage3_rules']);
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

      await copyFile(join(migrations, '0002_lobby.sql'), join(only0001, '0002_lobby.sql'));
      expect(await migrateToLatest(test.db, only0001)).toEqual(['0002_lobby']);
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

  it('0003 closes only active stage 1 rooms and preserves their data; runs once', async () => {
    const test = await createTestDatabase({ migrate: false });
    const old = await mkdtemp(join(tmpdir(), 'mig-0002-'));
    try {
      const migrations = fileURLToPath(new URL('../../migrations/', import.meta.url));
      for (const file of ['0001_init.sql', '0002_lobby.sql']) await copyFile(join(migrations, file), join(old, file));
      expect(await migrateToLatest(test.db, old)).toEqual(['0001_init', '0002_lobby']);
      const statuses = ['lobby', 'playing', 'finished', 'closed'] as const;
      const ids = [];
      for (const status of statuses) {
        const id = await seedRoom(test.db);
        ids.push(id);
        await test.db.updateTable('rooms').set({ status }).where('id', '=', id).execute();
        for (const entry of legacy.log) await sql`insert into game_log (game_id, revision, command_id, entry)
          values (${id}, ${entry.revision}, ${entry.command.commandId}, ${JSON.stringify(entry)}::jsonb)`.execute(test.db);
        await sql`insert into game_snapshots (game_id, revision, state)
          values (${id}, ${legacy.snapshot.revision}, ${JSON.stringify(legacy.snapshot)}::jsonb)`.execute(test.db);
      }
      const data = async () => ({
        logs: await test.db.selectFrom('game_log').selectAll().orderBy('game_id').orderBy('revision').execute(),
        snapshots: await test.db.selectFrom('game_snapshots').selectAll().orderBy('game_id').orderBy('revision').execute(),
        members: await test.db.selectFrom('room_members').selectAll().orderBy('room_id').execute(),
      });
      const before = await data();
      await copyFile(join(migrations, '0003_stage2_rules.sql'), join(old, '0003_stage2_rules.sql'));
      expect(await migrateToLatest(test.db, old)).toEqual(['0003_stage2_rules']);
      for (const [i, id] of ids.entries()) {
        const row = await test.db.selectFrom('rooms').select('status').where('id', '=', id).executeTakeFirstOrThrow();
        expect(row.status).toBe(i < 2 ? 'closed' : statuses[i]);
      }
      expect(await data()).toEqual(before);
      const current = await seedRoom(test.db);
      const session = createSession(gameEngine);
      const created = session.submit(sys('CreateGame', { seed: 42, rulesVersion: CURRENT_RULES_VERSION }, 0), { now: timestamp(1767225600000), entropy: entropy([1, 2, 3, 4]) });
      expect(created.kind).toBe('accepted');
      const entry = session.log[0]!;
      await sql`insert into game_log (game_id, revision, command_id, entry) values (${current}, 1, ${entry.command.commandId}, ${JSON.stringify(entry)}::jsonb)`.execute(test.db);
      const currentLog = await test.db.selectFrom('game_log').selectAll().where('game_id', '=', current).execute();
      const currentBefore = await test.db.selectFrom('rooms').selectAll().where('id', '=', current).execute();
      expect(await migrateToLatest(test.db, old)).toEqual([]);
      expect(await test.db.selectFrom('rooms').selectAll().where('id', '=', current).execute()).toEqual(currentBefore);
      // The new room stays active; old game payloads stay byte-for-byte equal as JSON.
      expect(await test.db.selectFrom('game_log').selectAll().where('game_id', '=', current).execute()).toEqual(currentLog);
      expect((await data()).logs.filter(r => r.game_id !== current)).toEqual(before.logs);
      expect((await data()).snapshots).toEqual(before.snapshots);
    } finally {
      await rm(old, { recursive: true, force: true });
      await test.drop();
    }
  });

  it('0004 closes only active stage 2 rooms and preserves their data; runs once', async () => {
    const test = await createTestDatabase({ migrate: false });
    const old = await mkdtemp(join(tmpdir(), 'mig-0003-'));
    try {
      const migrations = fileURLToPath(new URL('../../migrations/', import.meta.url));
      for (const file of ['0001_init.sql', '0002_lobby.sql', '0003_stage2_rules.sql']) await copyFile(join(migrations, file), join(old, file));
      expect(await migrateToLatest(test.db, old)).toEqual(['0001_init', '0002_lobby', '0003_stage2_rules']);
      const statuses = ['lobby', 'playing', 'finished', 'closed'] as const;
      const ids = [];
      for (const status of statuses) {
        const id = await seedRoom(test.db);
        ids.push(id);
        await test.db.updateTable('rooms').set({ status }).where('id', '=', id).execute();
        for (const entry of stage2.log) await sql`insert into game_log (game_id, revision, command_id, entry)
          values (${id}, ${entry.revision}, ${entry.command.commandId}, ${JSON.stringify(entry)}::jsonb)`.execute(test.db);
        await sql`insert into game_snapshots (game_id, revision, state)
          values (${id}, ${stage2.snapshot.revision}, ${JSON.stringify(stage2.snapshot)}::jsonb)`.execute(test.db);
      }
      const data = async () => ({
        logs: await test.db.selectFrom('game_log').selectAll().orderBy('game_id').orderBy('revision').execute(),
        snapshots: await test.db.selectFrom('game_snapshots').selectAll().orderBy('game_id').orderBy('revision').execute(),
        members: await test.db.selectFrom('room_members').selectAll().orderBy('room_id').execute(),
      });
      const before = await data();
      await copyFile(join(migrations, '0004_stage3_rules.sql'), join(old, '0004_stage3_rules.sql'));
      expect(await migrateToLatest(test.db, old)).toEqual(['0004_stage3_rules']);
      for (const [i, id] of ids.entries()) {
        const row = await test.db.selectFrom('rooms').select('status').where('id', '=', id).executeTakeFirstOrThrow();
        expect(row.status).toBe(i < 2 ? 'closed' : statuses[i]);
      }
      expect(await data()).toEqual(before);
      const current = await seedRoom(test.db);
      const session = createSession(gameEngine);
      const created = session.submit(sys('CreateGame', { seed: 42, rulesVersion: CURRENT_RULES_VERSION }, 0), { now: timestamp(1767225600000), entropy: entropy([1, 2, 3, 4]) });
      expect(created.kind).toBe('accepted');
      const entry = session.log[0]!;
      await sql`insert into game_log (game_id, revision, command_id, entry) values (${current}, 1, ${entry.command.commandId}, ${JSON.stringify(entry)}::jsonb)`.execute(test.db);
      const currentLog = await test.db.selectFrom('game_log').selectAll().where('game_id', '=', current).execute();
      const currentBefore = await test.db.selectFrom('rooms').selectAll().where('id', '=', current).execute();
      expect(await migrateToLatest(test.db, old)).toEqual([]);
      expect(await test.db.selectFrom('rooms').selectAll().where('id', '=', current).execute()).toEqual(currentBefore);
      // The new room stays active; old game payloads stay byte-for-byte equal as JSON.
      expect(await test.db.selectFrom('game_log').selectAll().where('game_id', '=', current).execute()).toEqual(currentLog);
      expect((await data()).logs.filter(r => r.game_id !== current)).toEqual(before.logs);
      expect((await data()).snapshots).toEqual(before.snapshots);
    } finally {
      await rm(old, { recursive: true, force: true });
      await test.drop();
    }
  });

  it('game rows must reference an existing room', async () => {
    await expect(
      sql`insert into game_log (game_id, revision, command_id, entry) values ('nope', 1, 'c', ${entry(1, 'c')})`.execute(h.db),
    ).rejects.toMatchObject({ code: '23503' });
  });
});
