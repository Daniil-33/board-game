# Design

## Context

`apps/server` is an empty package (`src/index.ts` re-exports one type; scripts
`typecheck`, `test`). game-core gives the host three contracts:

- `createSession(engine, initial?)` / `session.submit(command, { now, entropy })`:
  synchronous; an accepted command replaces `session.state` and appends a
  `LogEntry { command, now, entropy, revision, events }` to `session.log`.
- `restoreSession(engine, snapshotState, tail)`: replays the tail, throws
  `ReplayDivergenceError`. It does not deduplicate command ids logged before
  the snapshot ("that is the host's job").
- `pendingDeadlines(state)`: `{ target, at }[]`; `Timeout` is a system command
  with payload `null` and `expected: { kind: 'target', target }`, accepted
  when `now >= at`, rejected with `DEADLINE_NOT_REACHED` before and
  `TARGET_MISMATCH` when stale. A `Timeout` on an unrolled turn keeps the
  `turnId` and moves the deadline, so one target can time out twice.

State and log entries are plain JSON (`canonicalJson` compares them
independent of key order), so `jsonb` round trips are safe.

## Goals / Non-Goals

**Goals:** the write order is structural, not a convention; every failure
leaves the room equal to the DB or marked failed; the room knows no rules;
everything time- or randomness-dependent is injectable.

**Non-Goals:** throughput tuning, cross-process coordination beyond the unique
indexes, transport, projection.

## Decisions

### D1. Module layout

```
apps/server/
  migrations/0001_init.sql
  src/db/schema.ts        Kysely `Database` interface
  src/db/client.ts        createDb(url): Kysely<Database> over a pg Pool
  src/db/migrate.ts       SqlFileMigrationProvider, migrateToLatest(db)
  src/db/game-store.ts    loadGame, appendEntry, findEntryByCommandId, writeSnapshot, listActiveRoomIds
  src/context/clock.ts    Clock, systemClock
  src/context/entropy.ts  EntropySource, csprngEntropy
  src/timers/scheduler.ts TimerScheduler, systemScheduler
  src/rooms/room.ts       Room
  src/rooms/manager.ts    RoomManager
  src/rooms/index.ts      public interface (proposal § "Published room interface")
  src/logger.ts           Logger, consoleLogger
  src/testing.ts          FakeClock, seededEntropy for other packages' tests
  src/__tests__/*.test.ts      tests that need only Node (`pnpm test`)
  src/__tests__/*.int.test.ts  Postgres tests (`pnpm test:integration`)
  src/__tests__/helpers/       test DB, fake clock, seeded entropy, game driver
```

`src/index.ts` re-exports `rooms`, `db` (types, `createDb`, `migrateToLatest`)
and the context interfaces.

### D2. Schema (`0001_init.sql`)

```sql
create table guests (
  id text primary key,
  nickname text not null,
  token_hash text not null unique,
  created_at timestamptz not null default now()
);
create table rooms (
  id text primary key,
  creator_id text not null references guests(id),
  status text not null check (status in ('lobby', 'playing')),
  created_at timestamptz not null default now()
);
create table room_members (
  room_id text not null references rooms(id),
  guest_id text not null references guests(id),
  joined_at timestamptz not null default now(),
  primary key (room_id, guest_id)
);
create table game_log (
  game_id text not null references rooms(id),
  revision integer not null,
  command_id text not null,
  entry jsonb not null,
  primary key (game_id, revision),
  unique (game_id, command_id)
);
create table game_snapshots (
  game_id text not null references rooms(id),
  revision integer not null,
  state jsonb not null,
  primary key (game_id, revision)
);
```

(`rooms.status` is written as a named constraint, `rooms_status_check`, so a
later migration can extend it.) Exactly the columns of the Team Lead design;
no column carries product data beyond it. `entry` is the core `LogEntry` verbatim. jsonb values are passed as
`JSON.stringify(...)` text cast to `jsonb` (pg would turn a top-level JS array
into a Postgres array).

### D3. Migrations

Kysely's `Migrator` with a small custom `MigrationProvider` that reads
`migrations/*.sql` in name order and wraps each file as
`{ up: (db) => sql.raw(text).execute(db) }`. Up only. `migrateToLatest(db)`
throws on the first failed migration. No CLI here; the compose-e2e task wires
the run script. Alternative: Kysely's `FileMigrationProvider` with TS modules;
rejected, the handoff asks for plain SQL.

### D4. Serial executor and the command pipeline

Each room owns a promise-chain queue; `submit` and timer firings both enqueue,
so one game never runs two commands at once and order is arrival order.
`now` is taken from the clock synchronously inside `submit` (arrival), entropy
when the job starts. Arrival sampling keeps log times non-decreasing (queue
order is arrival order) and stops a slow insert of the previous command from
pushing a player past their deadline.

One job:

1. Room not `live` → `rejected ROOM_UNAVAILABLE`.
2. `findEntryByCommandId(gameId, commandId)`. Found and
   `canonicalJson({type, actor, expected, payload})` equals the stored
   command's → `accepted` with the stored `revision` and `events`,
   `duplicate: true`; nothing is written or emitted. Found and different →
   `rejected COMMAND_ID_CONFLICT` (the core's code). The fingerprint is the
   core session's definition of "same body".
3. `session.submit(command, { now, entropy })`. Rejected → return it; nothing
   is written or emitted.
4. Accepted → one transaction: insert the `game_log` row; if the phase left
   `lobby`, `update rooms set status = 'playing'`; if a snapshot is due (D6),
   insert it.
5. Commit succeeded → re-arm timers (D7), emit `update` to subscribers,
   resolve `accepted` with `duplicate: false`.
6. Transaction failed (any error; SQLSTATE `23505` is logged as a conflict) →
   D5.

Faults outside the listed steps never escape `submit`:

- The lookup in step 2 throws: nothing was executed, so the session still
  equals the DB. The command is `rejected PERSISTENCE_FAILED` without a
  reload and the armed timers are left alone.
- The engine throws in step 3 (an invariant violation is a core bug): the
  session did not advance. The command is `rejected ROOM_UNAVAILABLE`, the
  error is logged, the room stays live.
- A payload that is not plain data skips step 2 (it cannot be in the log) and
  is rejected by the session with `INVALID_PAYLOAD`.

The DB lookup in step 2 costs one indexed read per command and makes
duplicate handling identical before and after a restart, with no in-memory
index to rebuild. Alternative: load all command ids at restore; rejected, it
grows with the game and duplicates the unique index.

Listeners are called synchronously in subscription order; a throwing listener
is logged and does not affect the room or other listeners. `Room.state`
returns the last committed state, never the session's state between steps 3
and 5.

### D5. Persistence failure

The session has already advanced, so it is discarded: the room reloads
(`loadGame` + `restoreSession`), replaces its session, re-arms timers and
resolves the command as `rejected PERSISTENCE_FAILED` with the reloaded
revision. If the reloaded revision differs from the last emitted one (another
writer got there first), subscribers get `resync` with the reloaded state;
that state is persisted, so the invariant "no subscriber sees an unpersisted
state" holds. If the reload itself fails (DB unreachable, divergence), the
room becomes `failed`: timers cancelled, subscribers get `failed`, queued and
later commands are rejected with `ROOM_UNAVAILABLE`.

The reload re-arms timers at their real deadlines. One exception avoids a
hot loop when a `Timeout` insert keeps failing while reloads succeed: when
the failed command is itself a system `Timeout`, the timer of that
`Timeout`'s target fires no earlier than 1000 ms later. No other command's
failure can move a deadline (review RVW-001: a command id Postgres cannot
store, e.g. one containing U+0000, fails its lookup or insert every time and
could otherwise be resent to hold a deadline open). Rejecting such ids
before they reach the room is left to the protocol/API layer.

A fired timer is consumed. If its `Timeout` then ends without resolving the
deadline (rejected for any reason, or answered as a duplicate because a
deterministic entropy source repeated an id) while that deadline is still
pending and unarmed, the room arms it again with the same floor, so a
transient fault delays a turn but never stalls the game.

### D6. Snapshots

Written inside the accepting transaction when the accepted revision is a
multiple of 50 (revision counts accepted commands, so the rule survives
restarts without a counter) or when the phase left `lobby` (game start).
On `shutdown` each live room writes a snapshot of its current revision.
`insert ... on conflict (game_id, revision) do nothing` makes all three
idempotent. Old snapshots are kept.

Reading `state.phase` to detect game start is a host-level observation, not a
rule: the room never decides what a command does.

### D7. Timers

`TimerScheduler.schedule(at, fire)` returns a cancel function; the system
implementation uses `setTimeout(max(0, at - now))`. After every committed
transition, restore and reload the room cancels all its timers and arms one
per `pendingDeadlines(state)` entry; an overdue entry is scheduled for "now"
and fires on the next tick.

On firing: if `clock.now() < at` (`setTimeout` may fire early) the timer is
re-armed, otherwise the room enqueues

```ts
{ type: 'Timeout', commandId: `timeout-${hex(entropy.next())}`, actor: { kind: 'system' },
  expected: { kind: 'target', target }, payload: null }
```

through the same pipeline. The id is random, not derived from the target:
one target can time out twice (continuation), and a derived id could be
pre-empted by a client-chosen `commandId`. A stale firing is rejected by the
core's guard and changes nothing. Timer results are not returned to anyone;
subscribers see the `update`.

### D8. Loading and recovery

`loadGame(gameId)` reads, in one `repeatable read, read only` transaction,
the snapshot with the highest revision (none → `genesis()`) and all log
entries with a higher revision in order. `restoreSession` validates the tail.

`RoomManager.restoreAll()` lists `rooms` with status `lobby` or `playing` and
loads each. A room whose stored game is bad (`ReplayDivergenceError`,
invariant violation, corrupt row) is logged at error level with game id, tail
index and reason, kept in the manager as `failed`, and does not stop the
others. A room that could not be read (a database error on that load) is
logged and listed in `failed` too, but is not registered, so a later `open`
loads it (review RVW-002). A DB
error while listing rooms rejects `restoreAll` (boot fails loudly).

`open(gameId)` for a room not in memory checks the `rooms` row, then loads the
same way (empty log → genesis session). Concurrent `open` calls for one id
share one load promise. A bad stored game gives a `failed` room, as at boot;
a database error rejects `open` and registers nothing, so a later call can
succeed. After `shutdown`, `open` and `restoreAll` reject with
`RoomManagerClosedError` (code `ROOM_UNAVAILABLE`).

`shutdown()`: mark the manager closed (new `open`/`submit` → `ROOM_UNAVAILABLE`,
effective before the call returns), cancel timers, wait for every queue to
drain, snapshot every live room, set rooms to `closed`. A failed shutdown
snapshot is logged and does not fail shutdown: the log is complete without it. It does not destroy the Kysely instance; the owner of the
pool does.

### D9. Context sources

```ts
interface Clock { now(): Timestamp }
interface EntropySource { next(): Entropy }
```

`systemClock` is `timestamp(Date.now())`. `csprngEntropy` reads
`crypto.randomBytes(16)` as four big-endian uint32 words into `entropy()`.
Tests use a `FakeClock` that also implements `TimerScheduler`
(`advance(ms)` fires due timers in time order) and a counter-based
deterministic entropy source; both live under `src/__tests__/helpers` and are
exported from a `testing` entry so the e2e task can reuse them. `Timeout`
ids come from the entropy source, so a deterministic process restarting on an
existing database must use a new seed.

### D10. Test harness and CI

Two suites. `pnpm test` (`vitest.config.ts`, `*.test.ts` without
`*.int.test.ts`) needs only Node: context sources, fake clock, scheduler.
`pnpm test:integration` (`vitest.integration.config.ts`, `*.int.test.ts`) is
everything that touches Postgres; the root script runs it in every package
that defines it.

Integration tests read `TEST_DATABASE_URL`, default
`postgres://game:game@127.0.0.1:54329/postgres` (the `docker-compose.dev.yml`
service, `postgres:16-alpine`, bound to localhost, data on tmpfs). Each test
file (each test in `recovery.int.test.ts`, where `restoreAll` loads every
room) creates its own database `test_<random>`, runs `migrateToLatest` on it
(this is the "migrations up from an empty DB" check) and drops it afterwards,
so files run in parallel. An unreachable database fails the suite with a
message naming the compose command. Local commands are in
`apps/server/README.md`.

The room reaches the DB only through a `GameStore` interface
(`game-store.ts` is the Postgres implementation, the default). Tests wrap the
real store, never replace it:

- write order: the wrapper blocks `appendEntry` on a gate; while it is closed
  the test asserts no listener ran, `room.state` is unchanged and `game_log`
  has no row; after release the listener itself queries `game_log` and finds
  its revision committed;
- failing insert: the wrapper throws instead of inserting; the test asserts
  `PERSISTENCE_FAILED`, no listener call, and `room.state` equal to the DB;
- unique-index conflict: a second `Room` on the same game id (built without
  the manager) commits a command first; no wrapper involved.

CI: the existing `ci` job gets a `postgres:16-alpine` service with a health
check and a step `pnpm test:integration` with `TEST_DATABASE_URL` after
`pnpm test`; the job name stays `ci`.

Alternative: testcontainers. Rejected: a second way to start Postgres, slower
per file, and in agent sessions that predate the docker group change it would
require the whole test run under `sg docker`.

## Risks / Trade-offs

- One extra indexed read per command (D4 step 2). Acceptable at stage 1 load.
- `pnpm test` alone does not exercise persistence; `pnpm test:integration`
  does and fails (never skips) without Postgres. CI runs both.
- The core session keeps every accepted result (with its state) in memory for
  its own duplicate index, so a room's memory grows with the game until the
  next restart. Fine for stage 1 game lengths; a core-side change if it ever
  matters.
- A room that became `failed` stays failed in this process, also when the
  cause was a transient database outage during a reload; the next boot tries
  it again.
- A `Timeout` that cannot be persisted retries once per second while the DB
  accepts reads but not the write; the turn is late, never lost.
- Two processes on one game are not coordinated; the unique indexes turn the
  race into a `PERSISTENCE_FAILED` plus reload, never into a forked log.
- Local Node here is 26 while `engines` asks for 22; CI runs 22 and is the
  reference.
- `postgres:16` is chosen here; the compose-e2e task should use the same
  major version.
