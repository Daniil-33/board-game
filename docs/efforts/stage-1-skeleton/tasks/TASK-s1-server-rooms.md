# Team Lead -> Engineer Task Handoff

```yaml
id: TASK-s1-server-rooms
revision: 1
effort: EFF-stage-1-skeleton
project: economic-board-game
source_commit: main after TASK-s1-core-turns merges (PR #7)
owner: team-lead
status: proposed
```

## Outcome

The transport-independent server core in `apps/server`: a room process that
executes commands through game-core, persists every accepted command to
Postgres before anyone sees it, drives deadline timers, snapshots, and
restores every live room after a process restart. A later task
(`TASK-s1-server-api`) puts Fastify, guest auth, lobby routes and WebSocket on
top of this module.

## Acceptance criteria

Product (handoff criteria 3, 10, and the write-order constraint):

1. Commands for one game run strictly one at a time in arrival order.
2. For each command: the core session executes it; if accepted, the log entry
   is inserted into Postgres; only after the insert commits does the room emit
   its result to subscribers. A rejected command persists nothing.
3. If the insert fails (including a unique-index conflict), the room reloads
   from the DB and the command is reported as rejected with a distinct code;
   no subscriber ever sees an unpersisted state.
4. Timers: after every transition and after restore, the room arms one timer
   per `pendingDeadlines(state)` entry; on firing it submits a system
   `Timeout` with `expected: { kind: 'target', target }` and `now >= at`. A
   stale timer is rejected by the core and is harmless. An overdue deadline
   after restore fires immediately.
5. Recovery: on boot, every game in an active status is rebuilt from its
   latest snapshot plus the log tail via `restoreSession`; divergence is a
   hard error for that room (logged, room marked failed), not a silent reset.
6. Snapshots at game start, every 50 accepted commands and on clean shutdown.
7. Duplicate delivery: resubmitting the same `commandId` with the same body
   returns the original result and persists nothing new, including after a
   restart (unique `(game_id, command_id)`).

Technical proof:

8. Kysely with plain SQL migrations run by its `Migrator`: tables
   `guests`, `rooms`, `room_members`, `game_log` (unique `(game_id,
   revision)` and `(game_id, command_id)`, `entry jsonb`), `game_snapshots`.
   Guest/room tables are created here so the API task only adds queries.
9. Context: `now` from an injectable clock, `entropy` from
   `crypto.randomBytes` behind an injectable source (tests and the e2e task
   use a deterministic source; production wiring uses the CSPRNG).
10. Integration tests (vitest) against a real Postgres started by Docker:
    write order (subscriber never observes before commit, with a failing
    insert), unique-index conflict from a second writer, recovery from
    snapshot + tail equals the live state, timer firing with a fake clock,
    overdue deadline after restore, duplicate `commandId` across restart.
11. CI runs these tests with a Postgres service container.

## Scope and non-goals

In scope: `apps/server/src/{rooms,db,timers,...}`, migrations, server test
setup, CI workflow addition for Postgres, `docker-compose.dev.yml` (or a test
helper) for a local Postgres.

Not in scope: Fastify, HTTP, WebSocket, guest login, lobby logic (API task);
production Dockerfile and the full Compose stack (compose-e2e task); Redis,
multi-process rooms.

## Canonical references

- `docs/efforts/stage-1-skeleton.md` rev 2 (architecture constraints, criteria 3, 10).
- `docs/efforts/stage-1-skeleton/design.md` § "Server".
- game-core `pendingDeadlines`, `restoreSession`, `createSession`
  (`openspec/changes/engine-turn-cycle`).
- `ROADMAP.md` § "Технические решения", principles of the server part.

## Constraints and invariants

One room = one serial executor in one process. Write order: execute, persist,
then broadcast. Server supplies actor, time and CSPRNG entropy. No game rule
logic in the server. Docker runs as `sg docker -c '<command>'` in sessions
that predate the docker group change.

## Dependencies

Requires `TASK-s1-core-turns` merged. Runs in parallel with `TASK-s1-client`.
`TASK-s1-server-api` depends on this task's room interface: publish it in the
proposal (submit, subscribe, load/restore, shutdown).

## Delegated decisions

Module layout, room interface shape, Kysely types, migration naming, test
harness (testcontainers or a Compose-managed Postgres), snapshot write
transaction details. Return to the Team Lead for any schema column that
encodes product data beyond the listed tables.

## Required workflow

Explore -> Propose (OpenSpec change, report with `--wake`) -> Team Lead
approval -> Apply in a fresh context -> Verify -> PR -> Review fixes.

## Required checks

`pnpm build`, `pnpm test` including Postgres integration tests locally and in
CI, migrations up from an empty DB, `git diff --check`.

## Escalation conditions

Core contract gaps (`pendingDeadlines`/`restoreSession` insufficient);
write-order cannot be guaranteed with the chosen driver; CI cannot run
Postgres.

## Deliverables

Server room module, migrations, tests, CI change, OpenSpec change, branch
`agent/task-s1-server-rooms`, PR, CI evidence, independent review report,
residual risks.

The Engineer accepts the exact revision before editing. A material change
creates a new revision.
