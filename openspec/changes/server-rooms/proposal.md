# Proposal

## Why

Stage 1 ("Сквозной скелет", ROADMAP.md) needs an authoritative room server that
loses no game on restart (effort handoff `docs/efforts/stage-1-skeleton.md`
rev 2, criteria 3 and 10, and the write-order constraint). ROADMAP.md
§ "Технические решения", "Принципы серверной части" fixes the principles: one
room is one serial executor, the core executes, the accepted command is
persisted, only then updates are sent; rooms come back from a snapshot plus the
log tail and timers are recomputed from state deadlines. GAME-BREAKDOWN.md
§ "Принятые технические границы и текущая реализация" requires the server to be
authoritative and the core to stay free of I/O.

This change builds that server core in `apps/server` without any transport, so
`TASK-s1-server-api` can put Fastify, guest auth, lobby routes and WebSocket on
top of a published room interface. Task handoff: `TASK-s1-server-rooms` rev 1;
Team Lead design `docs/efforts/stage-1-skeleton/design.md` § "Server".

## What Changes

- `apps/server` gains runtime dependencies `kysely` and `pg` (dev:
  `@types/pg`) and the modules `src/db`, `src/rooms`, `src/timers`,
  `src/context`.
- Postgres schema as plain SQL migrations run by Kysely's `Migrator`:
  `guests`, `rooms`, `room_members`, `game_log`, `game_snapshots`.
- `Room`: a serial executor around one game-core session. Per command:
  execute, insert the log entry in a transaction, emit to subscribers only
  after commit. A failed insert reloads the room from the DB and rejects the
  command with `PERSISTENCE_FAILED`.
- Duplicate `commandId` with the same body returns the original result and
  writes nothing, also after a restart.
- Deadline timers armed from `pendingDeadlines(state)`; a fired timer submits
  the system `Timeout`.
- Snapshots at game start, every 50 accepted commands and on clean shutdown.
- `RoomManager`: restores every active room at boot from the latest snapshot
  plus the log tail via `restoreSession`; a room that diverges is logged and
  marked failed.
- Injectable clock, timer scheduler and entropy source; production wiring uses
  the system clock and `crypto.randomBytes`.
- Integration tests against a real Postgres, `docker-compose.dev.yml` for a
  local test database, a Postgres service container in CI.

## Published room interface (for `TASK-s1-server-api`)

```ts
// apps/server/src/rooms/index.ts
interface RoomManager {
  /** Boot: load every room with status 'lobby' or 'playing'. Never throws for one bad room. */
  restoreAll(): Promise<{ restored: string[]; failed: string[] }>;
  /** Get the live room, loading it from the DB on first use (a new room has an empty log). */
  open(gameId: string): Promise<Room>;       // throws RoomNotFoundError when no `rooms` row exists
  get(gameId: string): Room | undefined;
  /** Stop intake, drain every queue, cancel timers, snapshot every live room. Does not close the DB. */
  shutdown(): Promise<void>;
}

interface Room {
  readonly gameId: string;
  readonly status: 'live' | 'failed' | 'closed';
  /** Last persisted state. */
  readonly state: GameState;
  /** The caller (API layer) sets `actor`; the room adds time and entropy. Never throws. */
  submit(command: GameCommand): Promise<RoomResult>;
  /** Listener runs after commit, in revision order. Returns unsubscribe. */
  subscribe(listener: (event: RoomEvent) => void): () => void;
}

type RoomResult =
  | { kind: 'accepted'; commandId: CommandId; revision: Revision; events: readonly GameEvent[]; duplicate: boolean }
  | { kind: 'rejected'; commandId: CommandId; revision: Revision; error: { code: string; message: string } };

type RoomEvent =
  | { kind: 'update'; commandId: CommandId; revision: Revision; state: GameState; events: readonly GameEvent[] }
  | { kind: 'resync'; revision: Revision; state: GameState }   // room reloaded from the DB to a state not yet emitted
  | { kind: 'failed'; reason: string };

function createRoomManager(deps: {
  db: Kysely<Database>;
  clock?: Clock;                 // { now(): Timestamp }
  scheduler?: TimerScheduler;    // { schedule(at: Timestamp, fire: () => void): () => void }
  entropy?: EntropySource;       // { next(): Entropy }
  logger?: Logger;               // { info, warn, error }(message, fields?)
  engine?: GameEngine<GameState, GameCommand, GameEvent>;  // default gameEngine
}): RoomManager;
```

`state` and `events` are unprojected; the API layer applies `projectState` /
`projectEvents` per viewer. `rejected.error.code` is an engine or session code
passed through, or one of the two room codes `PERSISTENCE_FAILED` and
`ROOM_UNAVAILABLE` (`ROOM_UNAVAILABLE` already exists in `@game/protocol`).

The API task creates a room by inserting the `rooms` row (status `lobby`),
calling `open(id)` and submitting `CreateGame` / `AddPlayer` / `StartGame` as
the system actor. `src/db` exports the `Database` types, `createDb(url)` and
`migrateToLatest(db)`.

## Capabilities

### New Capabilities

- `server/rooms`: serial execution, write order, persistence failure,
  duplicate delivery, subscription.
- `server/persistence`: schema, migrations, snapshot policy.
- `server/timers`: deadline timers and the system `Timeout`.
- `server/recovery`: boot restore, divergence, shutdown.

## Decisions for Team Lead confirmation

All are inside the delegated set, listed because the API task depends on them.
Rationale is in `design.md`.

1. `rooms.status` has exactly `lobby` and `playing`. The room sets `playing`
   in the same transaction as the log entry that takes the core phase out of
   `lobby`, so status never disagrees with the log. The API task only inserts
   the row. No `finished` value: the stage 1 core has no game end.
2. "Marked failed" is in-memory (`Room.status = 'failed'`, error log). No
   status value is persisted, so the next boot tries the room again.
3. `now` is sampled when `submit` is called, not when the command is dequeued,
   so DB latency of an earlier command never costs a player their deadline.
4. Ids (`guests.id`, `rooms.id`, `game_id`) are `text`, matching the protocol's
   id strings; the API task chooses the generator. `game_id` is `rooms.id`.
5. Tests use a Postgres reached through `TEST_DATABASE_URL` (default: the
   `docker-compose.dev.yml` instance), not testcontainers; they fail, not
   skip, when it is unreachable.

## Impact

- `apps/server/**`, `pnpm-lock.yaml`, `.github/workflows/ci.yml`,
  new `docker-compose.dev.yml`.
- Root `pnpm test` now needs a reachable Postgres for `@game/server`.
- No change to `packages/game-core`, `packages/protocol`, `apps/client`.

## Out of Scope

- Fastify, HTTP, WebSocket, guest login, lobby logic, per-viewer projection,
  queries on `guests` / `room_members` beyond what tests need (API task).
- Production Dockerfile, the full Compose stack, a migration CLI or run
  script (compose-e2e task; this change exports `migrateToLatest`).
- Redis, several processes per room, horizontal scaling.
- Any game rule. The room reads `state.phase`, `state.revision` and
  `pendingDeadlines(state)` and nothing else of the rules.
- Game end, room deletion or expiry, down migrations.
