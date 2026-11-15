import { createServerContext } from './context/test-context.js';
import { createDb } from './db/client.js';
import { migrateToLatest } from './db/migrate.js';
import { consoleLogger, errorFields } from './logger.js';
import { createRoomManager } from './rooms/manager.js';
import { readConfig, type ServiceConfig } from './main-config.js';
import { createServer } from './server.js';

async function main(): Promise<void> {
  let config: ServiceConfig;
  try {
    config = readConfig(process.env);
  } catch (error) {
    consoleLogger.error('invalid configuration', errorFields(error));
    process.exit(1);
  }

  const context = createServerContext(config.testSeed);
  const db = createDb(config.databaseUrl);
  const migrated = await migrateToLatest(db);
  consoleLogger.info('database migrated', { applied: migrated });
  const manager = createRoomManager({ db, entropy: context.entropy });
  await manager.restoreAll();
  const app = await createServer({ db, manager, gameSeed: context.gameSeed });
  const address = await app.listen({ host: config.host, port: config.port });
  consoleLogger.info('server listening', { address });

  let stopping = false;
  const stop = async (signal: string): Promise<void> => {
    if (stopping) return;
    stopping = true;
    consoleLogger.info('server stopping', { signal });
    try {
      await app.close(); // stop accepting, close every socket
      await manager.shutdown(); // drain queues, snapshot rooms
      await db.destroy();
      process.exit(0);
    } catch (error) {
      consoleLogger.error('shutdown failed', errorFields(error));
      process.exit(1);
    }
  };
  process.on('SIGINT', () => void stop('SIGINT'));
  process.on('SIGTERM', () => void stop('SIGTERM'));
}

main().catch((error: unknown) => {
  consoleLogger.error('server failed to start', errorFields(error));
  process.exit(1);
});
