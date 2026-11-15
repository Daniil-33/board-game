import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { sql, type Kysely } from 'kysely';
import { Migrator, type Migration, type MigrationProvider } from 'kysely/migration';
import type { Database } from './schema.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations/', import.meta.url));

/** Plain `*.sql` files as up-only migrations, named by file name without the extension. */
class SqlFileMigrationProvider implements MigrationProvider {
  constructor(private readonly dir: string) {}

  async getMigrations(): Promise<Record<string, Migration>> {
    const files = (await readdir(this.dir)).filter((f) => f.endsWith('.sql')).sort();
    const migrations: Record<string, Migration> = {};
    for (const file of files) {
      const text = await readFile(join(this.dir, file), 'utf8');
      migrations[file.slice(0, -'.sql'.length)] = {
        async up(db) {
          await sql.raw(text).execute(db);
        },
      };
    }
    return migrations;
  }
}

/**
 * Apply every pending migration in name order. Returns the names executed by
 * this call (empty when the database is current); throws on the first failure.
 */
export async function migrateToLatest(db: Kysely<Database>, dir: string = MIGRATIONS_DIR): Promise<string[]> {
  const migrator = new Migrator({ db, provider: new SqlFileMigrationProvider(dir) });
  const { error, results } = await migrator.migrateToLatest();
  const failed = results?.find((r) => r.status === 'Error');
  if (error !== undefined || failed !== undefined) {
    const name = failed ? ` "${failed.migrationName}"` : '';
    throw new Error(`Migration${name} failed: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
  return (results ?? []).filter((r) => r.status === 'Success').map((r) => r.migrationName);
}
