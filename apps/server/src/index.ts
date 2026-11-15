export * from './rooms/index.js';

export type { ServerDeps } from './server.js';
export { createServer } from './server.js';
export type { ServiceConfig } from './main-config.js';
export { readConfig } from './main-config.js';

export type {
  Database,
  GuestsTable,
  RoomsTable,
  RoomMembersTable,
  GameLogTable,
  GameSnapshotsTable,
  RoomStatus as RoomRowStatus,
} from './db/schema.js';
export type { DbOptions } from './db/client.js';
export { createDb } from './db/client.js';
export { migrateToLatest } from './db/migrate.js';
export type { GameStore, LoadedGame, AppendOptions } from './db/game-store.js';
export { createGameStore, CorruptGameDataError } from './db/game-store.js';

export type { Clock } from './context/clock.js';
export { systemClock } from './context/clock.js';
export type { EntropySource } from './context/entropy.js';
export { csprngEntropy } from './context/entropy.js';
export type { TimerScheduler } from './timers/scheduler.js';
export { createSystemScheduler } from './timers/scheduler.js';
export type { Logger, LogFields } from './logger.js';
export { consoleLogger } from './logger.js';
