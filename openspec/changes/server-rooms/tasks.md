# Tasks

All paths are under `apps/server` unless noted. After each group:
`pnpm build` and `pnpm --filter @game/server test` pass. Local Postgres:
`sg docker -c 'docker compose -f docker-compose.dev.yml up -d --wait'`
(plain `docker compose` in sessions started after the docker group change).

## 1. Database foundation (spec: server/persistence "Schema", "Migrations")

- [ ] 1.1 Add `kysely`, `pg`, `@types/pg` to `package.json`; update
  `pnpm-lock.yaml`. Verify: `pnpm install --frozen-lockfile`, `pnpm build`.
- [ ] 1.2 Add `docker-compose.dev.yml` at the repo root (`postgres:16-alpine`,
  `127.0.0.1:54329`, health check). Verify: `up -d --wait` exits 0 and
  `pg_isready` succeeds in the container.
- [ ] 1.3 `migrations/0001_init.sql`, `src/db/schema.ts`, `src/db/client.ts`,
  `src/db/migrate.ts` (design D2, D3). Verify: `migrate.test.ts` on a fresh
  database: five tables exist, second run executes nothing, both unique
  violations of `game_log` are raised.
- [ ] 1.4 Test helper `src/__tests__/helpers/db.ts`: per-file database
  create/migrate/drop from `TEST_DATABASE_URL`, clear failure when
  unreachable; helpers to insert a guest and a room row (design D10).
  Verify: used by 1.3.

## 2. Context sources (spec: server/rooms "Server-supplied context")

- [ ] 2.1 `src/context/clock.ts`, `src/context/entropy.ts`,
  `src/timers/scheduler.ts`, `src/logger.ts` (design D7, D9). Verify: unit
  test that `csprngEntropy.next()` returns valid distinct `Entropy` values.
- [ ] 2.2 `src/__tests__/helpers/fake-clock.ts` (clock + scheduler,
  `advance(ms)`), `seeded-entropy.ts`, exported through `src/testing.ts`.
  Verify: unit test of ordering, cancellation and overdue scheduling.

## 3. Game store (spec: server/persistence "Schema", "Snapshot policy", "Room status follows the log")

- [ ] 3.1 `src/db/game-store.ts`: `GameStore` interface and Postgres
  implementation with `loadGame`, `findEntryByCommandId`, `appendEntry`
  (one transaction: log row, optional status update, optional snapshot),
  `writeSnapshot`, `listActiveRoomIds`, `roomExists` (design D4, D6, D8).
  Verify: `game-store.test.ts`: entry round trip by canonical JSON, latest
  snapshot plus tail selection, idempotent snapshot write.

## 4. Room (spec: server/rooms)

- [ ] 4.1 `src/rooms/room.ts`: serial queue, pipeline steps 1-5 of design D4,
  subscription, `Room.state` as last committed state. Verify:
  `room.order.test.ts` (concurrent submits resolve in order, consecutive
  revisions; rejected command writes nothing) and `room.write-order.test.ts`
  (gated insert: no listener, unchanged state, no row; listener finds its
  revision committed).
- [ ] 4.2 Persistence failure and reload (design D5). Verify:
  `room.failure.test.ts`: throwing insert → `PERSISTENCE_FAILED`, no update,
  state equals DB; second writer → `PERSISTENCE_FAILED`, `resync` at the
  other writer's revision, one row at N+1; reload failure → room `failed`,
  later submit `ROOM_UNAVAILABLE`.
- [ ] 4.3 Duplicate delivery (design D4 step 2). Verify:
  `room.duplicate.test.ts`: same command twice, reused id with different
  body, duplicate of a command older than the latest snapshot.

## 5. Timers (spec: server/timers)

- [ ] 5.1 Arm/cancel from `pendingDeadlines`, firing through the pipeline,
  early-fire re-arm, 1000 ms floor after a failed `Timeout` insert (design
  D5, D7). Verify: `room.timers.test.ts` with the fake clock: deadline
  reached, one millisecond early, continuation (second `Timeout` on the same
  turn), stale `Timeout` rejected with `TARGET_MISMATCH`, no timer in lobby.

## 6. Manager and recovery (spec: server/recovery; server/persistence "Snapshot policy")

- [ ] 6.1 `src/rooms/manager.ts` and `src/rooms/index.ts`: `restoreAll`,
  `open`, `get`, `shutdown` (design D8); export from `src/index.ts`. Verify:
  `recovery.test.ts`: restored state deep-equal to live state across a
  snapshot (play past revision 50), no-snapshot lobby game, two rooms,
  tampered entry → failed room with rows untouched and the other room live,
  `RoomNotFoundError`.
- [ ] 6.2 Recovery interplay. Verify: `recovery.test.ts`: overdue deadline
  fires right after restore without advancing the clock; duplicate
  `commandId` across restart; snapshots at game start, revision 50 and
  shutdown; shutdown during an in-flight insert; no `Timeout` after
  shutdown; `rooms.status` is `playing` after `StartGame` and stays `lobby`
  when that insert fails.

## 7. CI (handoff criterion 11)

- [ ] 7.1 `.github/workflows/ci.yml`: Postgres 16 service with health check
  and `TEST_DATABASE_URL` on the existing `ci` job. Verify: the PR's CI run
  shows the server integration tests executed and passing.

## 8. Verify

- [ ] 8.1 `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm test` with
  the compose Postgres, `git diff --check`; compare the diff against handoff
  criteria 1-11.
