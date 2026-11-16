import { fixturesEnabled } from './main-config.js';
import websocket from '@fastify/websocket';
import { MAX_FRAME_LENGTH } from '@game/protocol';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { createGuestStore } from './auth/guests.js';
import { registerAuthRoutes } from './auth/routes.js';
import type { Database } from './db/schema.js';
import { registerOriginHooks } from './http/origins.js';
import { createHttpApp } from './http/app.js';
import { createRoomQueries } from './lobby/queries.js';
import { lobbyRoutes } from './lobby/routes.js';
import { createLobbyService } from './lobby/service.js';
import { consoleLogger, type Logger } from './logger.js';
import type { RoomManager } from './rooms/types.js';
import type { GameConnection } from './ws/connection.js';
import { ConnectionRegistry } from './ws/registry.js';
import { registerGameSocket } from './ws/routes.js';

export interface ServerDeps {
  readonly allowedOrigins?: readonly string[];
  readonly gitSha?: string;
  readonly gameSeed?: () => number;
  readonly db: Kysely<Database>;
  /** Created and owned by the caller (it restores rooms and shuts them down). */
  readonly manager: RoomManager;
  /** Default: JSON lines on the console. */
  readonly logger?: Logger;
  /** Default `HELLO_TIMEOUT_MS`. */
  readonly helloTimeoutMs?: number;
}

/**
 * The HTTP lobby and the game socket over an existing room manager. Not
 * listening yet: the caller calls `listen`, and `close` (which closes every
 * socket) before shutting the manager down.
 */
export async function createServer(deps: ServerDeps): Promise<FastifyInstance> {
  const enableFixtures = fixturesEnabled(process.env);
  const logger = deps.logger ?? consoleLogger;
  const guests = createGuestStore(deps.db);
  const queries = createRoomQueries(deps.db);
  const lobby = createLobbyService({ db: deps.db, manager: deps.manager, queries, logger, ...(deps.gameSeed ? { gameSeed: deps.gameSeed } : {}) });

  const app = createHttpApp(logger);
  registerOriginHooks(app, deps.allowedOrigins ?? []);
  app.get('/api/health', async () => ({ status: 'ok', sha: deps.gitSha ?? 'unknown' }));
  // A frame of MAX_FRAME_LENGTH UTF-16 units is at most 3 bytes per unit in UTF-8.
  await app.register(websocket, { options: { maxPayload: MAX_FRAME_LENGTH * 3 } });
  registerAuthRoutes(app, guests);
  await app.register(lobbyRoutes, { guests, lobby });
  registerGameSocket(app, {
    guests,
    queries,
    manager: deps.manager,
    registry: new ConnectionRegistry<GameConnection>(),
    logger,
    ...(deps.helloTimeoutMs !== undefined ? { helloTimeoutMs: deps.helloTimeoutMs } : {}),
  });
  if (enableFixtures) {
    const { registerFixtureLoader } = await import('./test-fixture-loader.js');
    registerFixtureLoader(app, deps.db, guests, () => deps.manager.now());
  }
  return app;
}
