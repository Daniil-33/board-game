# @game/server

The authoritative game server. This package currently holds the
transport-independent core: rooms, persistence, timers and recovery. HTTP,
WebSocket and guest auth are added on top of `createRoomManager`.

## Layout

- `migrations/` plain SQL, applied in name order by `migrateToLatest(db)`.
- `src/db/` Kysely types, `createDb(url)`, the migrator and the game store
  (log, snapshots, room status).
- `src/rooms/` `Room` (one serial executor per game: execute, persist, then
  emit) and `RoomManager` (boot restore, open, shutdown).
- `src/timers/`, `src/context/` injectable scheduler, clock and entropy.
- `src/testing.ts` `FakeClock` and `seededEntropy`, importable as
  `@game/server/testing`.

## Tests

`pnpm test` needs only Node.

`pnpm test:integration` runs everything that touches Postgres against a real
database and fails, rather than skips, when it cannot reach one. Each test
file creates and drops its own database, so the server only has to be up:

```sh
# from the repository root
docker compose -f docker-compose.dev.yml up -d --wait   # Postgres 16 on 127.0.0.1:54329, data in memory
pnpm test:integration
docker compose -f docker-compose.dev.yml down
```

To use another server, set `TEST_DATABASE_URL` to a connection string whose
role may create databases (default
`postgres://game:game@127.0.0.1:54329/postgres`). CI uses a Postgres service
container.

In agent sessions that predate the docker group change, wrap the compose
commands: `sg docker -c 'docker compose -f docker-compose.dev.yml up -d --wait'`.
