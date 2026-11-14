# Stage 1 skeleton: Team Lead technical design

Effort: `EFF-stage-1-skeleton`, handoff `docs/efforts/stage-1-skeleton.md`.
Revision 1 accepted by the Team Lead on 2026-11-14 at main `5a05807`.
Revision 2 (interim-jail release double grants no bonus turn, PR #2) acknowledged
on 2026-11-14 at main `a68ed55`.

This document holds the technical decisions delegated to the Team Lead. It does
not change product behavior; product rules come only from the handoff,
`ROADMAP.md` stage 1 and `GAME-BREAKDOWN.md`.

## Delegated decisions

| Decision | Choice | Why |
|---|---|---|
| Schema library | **TypeBox** | Emits JSON Schema that Fastify validates natively; static types without a second definition; the same schema checks WebSocket frames on both sides. |
| DB access | **Kysely** with its `Migrator` and plain SQL migrations | SQL-first, no codegen step, no heavy ORM; the jsonb log needs hand-written queries anyway. |
| Snapshot frequency | Every 50 accepted commands, at game start, and on clean shutdown | Recovery replays at most 50 entries; well below any latency target. |
| Server tests | vitest against a real Postgres started with Docker (`sg docker -c ...` until sessions restart) | Exercises the unique-index and recovery paths for real. |
| Browser scenario evidence | Playwright with several browser contexts | Two and three clients, tab reload and server restart in one script. |
| Node | 22 LTS in CI and containers | Matches `@types/node` 22. |

## Packages and boundaries

```
packages/game-core   pure rules, no I/O (existing)
packages/protocol    TypeBox schemas + types; depends on game-core types only
apps/server          Fastify, WS, rooms, Postgres; depends on game-core, protocol
apps/client          Vite, Vue 3, PixiJS; depends on protocol (and game-core types)
```

`apps/client` must not import game-core runtime logic to decide outcomes; it
may import types and pure display helpers only.

## Core additions (`packages/game-core`)

State gains, with visibility classified in `STATE_VISIBILITY`:

- `phase`: `lobby | setup | playing` (existing `setup` becomes the order-roll phase).
- `setup`: roll groups, per-participant pending roll with `deadline`, current
  `setupRollId` (target id, never reused).
- `order`: final turn order.
- `turn`: `{ turnId, playerId, deadline, rolled, continuation, doublesStreak, quotas: { builds, offers }, pendingBonus }`.
- `positions`: player -> cell index on a placeholder ring of 40 cells,
  exported as `PLACEHOLDER_RING` with an explicit `PLACEHOLDER` marker and a
  placeholder jail cell.
- `jail`: per player `{ attemptsUsed }` under `INTERIM_JAIL_RULE` (named and
  marked temporary, replaced in stage 6).

Commands (actor, guard):

| Command | Actor | Guard |
|---|---|---|
| `RollForOrder` | player | target `setupRoll` |
| `RollDice` | player | target `turn` |
| `EndTurn` | player | target `turn` |
| `Timeout` | system | target `turn` or `setupRoll` (payload names which) |

Player commands are accepted only when `context.now < deadline`; `Timeout` only
when `context.now >= deadline`. The rest follows the handoff criteria 2-7.

Host contract, used by the server to drive timers without knowing rules:

```ts
export interface PendingDeadline { readonly target: TargetRef; readonly at: Timestamp }
export function pendingDeadlines(state: GameState): readonly PendingDeadline[];
```

The server sets one timer per returned entry and on firing submits
`Timeout { expected: { kind: 'target', target } }` with `now >= at`. A stale
timer is rejected by the target guard, so restarts and duplicate timers are
safe.

Recovery contract: `restoreSession(engine, snapshotState, tail: LogEntry[])`
replays the tail on top of the snapshot and fails with
`ReplayDivergenceError` on mismatch.

## Protocol (`packages/protocol`)

`PROTOCOL_VERSION = 1`. WebSocket frames are JSON objects with a `t` tag.

- Client -> server: `Hello { protocolVersion, token, gameId, lastRevision | null }`,
  `Command { commandId, type, expected, payload }`.
- Server -> client: `Welcome { protocolVersion, playerId, revision, view }`,
  `Ack { commandId, outcome: 'accepted' | 'rejected', revision, error? }`,
  `Update { revision, view, events }` (full viewer projection plus that
  viewer's projected events for animation), `Error { code, message }`.
- Error codes: protocol-level (`PROTOCOL_VERSION_UNSUPPORTED`,
  `UNAUTHENTICATED`, `NOT_A_PARTICIPANT`, `MALFORMED_FRAME`, `ROOM_UNAVAILABLE`)
  plus pass-through engine error codes.
- The client never sends `actor`; the server sets it from the session.
- Reconnect: a fresh `Hello` with the last known revision; the server answers
  `Welcome` with the current full view. No delta replay in stage 1.
- HTTP lobby schemas (guest login, room create/list/join/start) live here too.
- Interim-jail fields are marked temporary in schema descriptions.

## Server (`apps/server`)

- **Room process.** One in-process actor per game: a serial queue that, for
  each command, (1) runs the core session, (2) on acceptance inserts the log
  entry in Postgres, (3) only after commit broadcasts `Ack` and `Update`.
  If the insert fails, the room reloads from the DB and the command is
  reported as rejected.
- **Context.** `now` from the server clock, `entropy` from `crypto.randomBytes`,
  actor from the WS session.
- **Timers.** Re-armed after every transition from `pendingDeadlines(state)`.
- **Persistence (Kysely).** Tables: `guests(id, nickname, token_hash,
  created_at)`, `rooms(id, creator_id, status, created_at)`,
  `room_members(room_id, guest_id, joined_at)`, `game_log(game_id, revision,
  command_id, entry jsonb)` with unique `(game_id, revision)` and unique
  `(game_id, command_id)`, `game_snapshots(game_id, revision, state jsonb)`.
- **Recovery.** On boot, every room in status `playing` or `lobby` is restored
  from its latest snapshot plus log tail; timers are re-armed from state
  deadlines, so an overdue deadline fires immediately.
- **Lobby** maps onto existing core lifecycle commands: create room ->
  `CreateGame` (server seed), join -> `AddPlayer`, start (creator only, at
  least two members) -> `StartGame`.
- **Bind address** `127.0.0.1` in Compose; no public exposure.

## Client (`apps/client`)

Vue 3 for login, lobby and HUD (turn order, timer from the server deadline,
dice/end-turn buttons). PixiJS canvas for the ring, tokens, dice and movement
animation driven by `Update.events`. The guest token is kept in
`localStorage` so a tab reload reconnects to the same seat.

## Tasks and order

```
TASK-s1-ci ──┬─> TASK-s1-core-turns ──┬─> TASK-s1-server-rooms ─> TASK-s1-server-api ─┐
             └─> TASK-s1-protocol ────┘                                               ├─> TASK-s1-compose-e2e
                         └──────────────> TASK-s1-client ─────────────────────────────┘
```

At most two Engineers run at once. Core and protocol run in parallel after CI.
Server tasks follow core. The client starts once protocol is merged and works
against a local mock until the server API lands. Compose and end-to-end
evidence close the effort and update `ROADMAP.md` "Сделано".

Each task has its own handoff in `tasks/`.

## Evidence plan

Per task: green CI on the PR head, independent review of the exact commit
range, the task's focused checks. Effort completion, from the handoff:
Playwright scenarios for two and three clients through setup and several
turns, tab reload mid-turn, server restart mid-game, AFK auto-roll with
deadline close, and a seeded third-double-to-jail run; core replay tests;
green CI on final `main`.
