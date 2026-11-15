import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import { consoleLogger } from '../logger.js';
import type { Database } from './schema.js';

export interface DbOptions {
  /** Maximum pool size; pg's default when omitted. */
  readonly max?: number;
  /**
   * Called when an idle pooled connection breaks (for example the database
   * restarted). pg discards that connection; without a handler the event
   * would crash the process. Default: one JSON line on stderr.
   */
  readonly onPoolError?: (error: Error) => void;
}

/** A Kysely instance over its own pg pool. The caller owns it and calls `destroy()`. */
export function createDb(connectionString: string, options: DbOptions = {}): Kysely<Database> {
  const pool = new pg.Pool({
    connectionString,
    ...(options.max !== undefined ? { max: options.max } : {}),
  });
  const onPoolError =
    options.onPoolError ?? ((error: Error) => consoleLogger.error('idle database connection failed', { error: error.message }));
  pool.on('error', onPoolError);
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
}
