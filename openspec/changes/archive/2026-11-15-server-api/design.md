# Design

## Context

- Room module (`apps/server/src/rooms`, server-rooms): `RoomManager.open`,
  `Room.submit(command)` (caller sets `actor`), `subscribe` after commit,
  `RoomEvent` `update` / `resync` / `failed`; `rooms.status` set to `playing`
  inside the log transaction; `restoreAll` loads `lobby` and `playing` rooms.
- `GameStore.appendEntry(gameId, entry, { markPlaying, snapshot })`.
- Protocol: TypeBox schemas, `decodeClientFrame`, `NICKNAME_FORMAT`.
- Core (with engine-resignation): `CreateGame { seed, rulesVersion }`,
  `AddPlayer` / `LeaveLobby { playerId }`, `StartGame` (system, revision
  guard, phase `lobby`); `Resign` (player, `null`, revision guard, phases
  `setup` / `playing`); phase `finished`; `projectState`, `projectEvents`.
- Client: routes `/api/guests`, `/api/rooms`, `/api/rooms/:id/join`,
  `/api/rooms/:id/start`, `/ws`; dev proxy to `127.0.0.1:8787`; it opens the
  socket in phase `lobby` and follows `Update`.

## Goals / Non-Goals

**Goals:** a thin transport over the room module; one place that decides
membership (the committed core state); status and `room_members` never
disagree with the log; secrets never stored or logged in plain text.

**Non-Goals:** scaling, rate limiting, memory eviction, client UI.

## Decisions

### D1. Layout

```
apps/server/src/
  main.ts              env -> createServer -> listen; signals
  server.ts            createServer({ db, manager, clock?, logger?, ... }): FastifyInstance
  http/app.ts          Fastify instance, Ajv options, error handler, ApiError
  http/errors.ts       ApiError(code, status, message), engine-code mapping
  auth/tokens.ts       newToken, hashToken (sha256 hex), newId(prefix)
  auth/guests.ts       guest store (insert, findByTokenHash), authenticate hook
  auth/routes.ts       POST /api/guests
  lobby/access-code.ts hashAccessCode / verifyAccessCode (scrypt)
  lobby/queries.ts     room summaries (list, get) from rooms/room_members/guests
  lobby/service.ts     create/join/leave/start over RoomManager
  lobby/routes.ts      routes + schemas
  ws/registry.ts       (roomId, guestId) -> connection
  ws/connection.ts     per-socket state machine
  ws/routes.ts         GET /ws
```

`createServer` takes the database and an already created `RoomManager`, so
tests inject `FakeClock` and seeded entropy, and a restart test builds a
second server on the same database.

### D2. Ids, tokens, hashing

- `guestId = 'g_' + 16 bytes base64url`, `roomId = 'r_' + 16 bytes
  base64url`, from `crypto.randomBytes`. Server command ids for lobby
  commands: `'lobby-' + 16 bytes base64url` (never colliding with timer ids).
- Token: 32 bytes base64url (43 chars, inside `TOKEN_PATTERN`);
  `token_hash = sha256(token)` hex. A high-entropy token needs no slow hash;
  lookup is by the unique hash.
- Access code: low entropy and user chosen, so `scrypt` with a 16-byte salt;
  stored as `scrypt$<N>$<r>$<p>$<salt b64url>$<hash b64url>`; compared with
  `timingSafeEqual`. Never logged: the request logger is off for bodies and
  the error mapper never echoes input.
- Seed: `randomInt(0, 2**32)` from `node:crypto`.

### D3. Membership and lobby flow

The committed core state is the authority on membership: a guest is a
member of a room iff `room.state.players` contains its id (including
eliminated players, who may still watch the end). `room_members` mirrors it
in the log transaction (D4) and only serves SQL listing.

- **Create:** insert `rooms(id, creator, 'lobby', access_code_hash)`, `open`,
  submit `CreateGame { seed, rulesVersion: CURRENT_RULES_VERSION }` then
  `AddPlayer { playerId: creator }`. If either is rejected the row is set
  to `closed` (best effort) and the request fails with 503
  `ROOM_UNAVAILABLE`. A crash between the steps leaves a memberless lobby
  room; listing requires at least one member, so it never shows.
- **Join:** status `lobby` (else `ROOM_CLOSED` / engine `PHASE_NOT_ALLOWED`),
  already a member -> 200 with the summary (idempotent), locked -> code
  required and verified, then `AddPlayer`. Seats: the core enforces
  `PLAYER_LIMIT_REACHED`.
- **Leave:** lobby only (`PHASE_NOT_ALLOWED` otherwise; resignation is the
  socket `Resign`); member only. `LeaveLobby { playerId }`, with
  `closeRoom: true` when the caller is the creator.
- **Start:** creator only (`NOT_ROOM_CREATOR`), `StartGame`; the core
  enforces `NOT_ENOUGH_PLAYERS`.
- System commands use `expected: { kind: 'revision', revision:
  room.state.revision }`. Two concurrent lobby requests can race; on
  `REVISION_MISMATCH` the service re-reads the state, re-checks its
  preconditions and retries, at most 5 times, then answers 409.

### D4. Room-module change (status transitions only)

`AppendOptions` becomes `{ status: 'playing' | 'finished' | 'closed' | null,
members: string[] | null, snapshot }`. The room computes it from the
previous and new committed state: `playing` when leaving phase `lobby`,
`finished` when entering `finished`, `closed` when the submit carried
`closeRoom` (it wins over the others); `members` is the new `state.players`
id list when it changed, and the store makes `room_members` exactly that set
(rows that stay keep `joined_at`). `room_members` references `guests`, so
room tests that use bare player ids create those guests in the test store
wrapper; the API only ever adds real guests. The store applies everything in the existing
transaction. The room still reads no rule: phase names and the player list
are state shape, like today's `markPlaying`.

`Room.submit(command, options?: { closeRoom?: boolean })`. After a commit
with `closeRoom`, the room emits `update`, then `{ kind: 'closed' }`, stops
accepting (later submits: `ROOM_UNAVAILABLE`) and cancels timers.
`closeRoom` on a rejected or duplicate command does nothing.

A snapshot is also written when the game finishes (cheap final state for
`Hello` on a finished room). `restoreAll` is unchanged (lobby, playing);
`open` of a `finished` room loads it on demand; `open` of a `closed` room is
not attempted by the API (status checked first).

### D5. Room summary and listing

`RoomSummary { roomId, creatorId, status, locked, joinable, members }`.
`status` is `rooms.status`; `locked = access_code_hash is not null`;
`joinable = status = 'lobby' and not locked and members < MAX_PLAYERS`.
List query: rooms with status `lobby` or `playing`, plus `finished` rooms
the caller is a member of, each with at least one member; members ordered by
`joined_at`; rooms ordered by `created_at` desc. Get: any status for a
member (`closed` included, so a polling member learns of closing);
non-member -> 403 `NOT_A_PARTICIPANT`; unknown -> 404 `ROOM_UNAVAILABLE`.

### D6. HTTP surface and errors

Ajv: `removeAdditional: false`, `coerceTypes: false`, `allErrors: false`,
`NICKNAME_FORMAT` added; schema validation failures and malformed JSON ->
400 `INVALID_REQUEST`. A missing body on join/leave/create is treated as
`{}` (preValidation), so the current client keeps working.

| Situation | Status | Code |
|---|---|---|
| missing/bad bearer, unknown token | 401 | `UNAUTHENTICATED` |
| schema / JSON error | 400 | `INVALID_REQUEST` |
| unknown room | 404 | `ROOM_UNAVAILABLE` |
| room closed | 409 | `ROOM_CLOSED` |
| locked, no code / wrong code | 403 | `ACCESS_CODE_REQUIRED` / `ACCESS_CODE_INVALID` |
| not a member (get, leave) | 403 | `NOT_A_PARTICIPANT` |
| start by non-creator | 403 | `NOT_ROOM_CREATOR` |
| engine rejection | 409 | engine code unchanged |
| failed room, DB error, retries exhausted | 503 | `ROOM_UNAVAILABLE` / `PERSISTENCE_FAILED` |

Unexpected errors are logged with a request id and answered 500
`ROOM_UNAVAILABLE` without details.

### D7. Game socket

Per socket: `awaitingHello` -> `ready` -> `closed`.

1. First frame within 10 s must be a valid `Hello`; otherwise `Error`
   (`MALFORMED_FRAME`) and close (code 1008).
2. `protocolVersion !== 1` -> `PROTOCOL_VERSION_UNSUPPORTED`; token unknown
   -> `UNAUTHENTICATED`; room unknown or failed -> `ROOM_UNAVAILABLE`;
   `closed` -> `ROOM_CLOSED`; not a member -> `NOT_A_PARTICIPANT`. Each:
   `Error` then close.
3. Subscribe first, then send `Welcome { playerId: guestId, revision, view }`
   from `room.state`; room events with revision <= the Welcome revision are
   dropped, so nothing is missed or duplicated. `lastRevision` is accepted
   and ignored beyond logging (stage 1: always full view).
4. Register `(roomId, guestId)`; an older socket there gets `Error
   { code: 'CONNECTION_REPLACED' }` and is closed with code 4001. Its close
   does not unregister the new one. A distinct code is needed: the current
   client reconnects after any close except `NOT_A_PARTICIPANT` /
   `ROOM_UNAVAILABLE` (which make it forget the room in shared
   `localStorage`), so two tabs of one guest would otherwise replace each
   other forever. Handling `CONNECTION_REPLACED` and `ROOM_CLOSED` (stop
   reconnecting) is client work for TASK-s1-client-lobby; until then the
   current client retries with backoff.
5. `Command` -> `GameCommand` with `actor: { kind: 'player', id: guestId }`
   -> `submit` -> `Ack` (accepted with the result revision, also for a
   duplicate; rejected with the error). Room `update` -> `Update` with
   `projectState` / `projectEvents` for this viewer, sent before the `Ack`
   because the room emits on commit. `resync` -> `Update` with `events: []`.
   `failed` -> `Error ROOM_UNAVAILABLE`, close. `closed` -> `Error
   ROOM_CLOSED`, close.
6. A member removed by `LeaveLobby` gets the `Update`, then `Error
   NOT_A_PARTICIPANT` and close.
7. A second `Hello`, or a malformed frame after `Hello`: `Error
   MALFORMED_FRAME`, socket stays open. Socket close only unsubscribes; it is
   never resignation.
8. Outbound send failures and backpressure: a socket whose buffered amount
   exceeds 4 MiB is closed (client reconnects with `Hello`).

### D8. Protocol additions

- `common.ts`: `ID_PATTERN` on every id and command id (and target ref
  fields): no U+0000, surrogates only as valid pairs. TypeBox compiles
  patterns without the `u` flag and Ajv with it, so the pattern is written
  with explicit surrogate ranges that mean the same in both modes; `LOBBY_ERROR_CODES` gains
  `ACCESS_CODE_REQUIRED`, `ACCESS_CODE_INVALID`; `PROTOCOL_ERROR_CODES`
  gains `ROOM_CLOSED` and `CONNECTION_REPLACED`.
- `lobby.ts`: `AccessCodeSchema`; `CreateRoomRequest { accessCode? }`;
  `CreateRoomResponse { room, accessCode?, inviteLink? }`;
  `JoinRoomRequest { accessCode? }`; `GetRoomResponse { room }`;
  `LeaveRoomResponse { room }`; summary fields of D5; statuses
  `lobby | playing | finished | closed`.
- `frames.ts`: `CLIENT_COMMAND_TYPES` = `RollForOrder`, `RollDice`,
  `EndTurn`, `Resign`; the STUB note is replaced by the source of the names.
- `nickname.ts`: RVW-007, at least one code point other than U+200C/U+200D,
  first and last code point not a joiner.

### D9. Service entry

`main.ts`: `DATABASE_URL` required (exit 1 with a message otherwise),
`HOST` default `127.0.0.1`, `PORT` default `8787`; `migrateToLatest`,
`manager.restoreAll()`, `listen`. On SIGINT/SIGTERM: `app.close()` (closes
sockets), `manager.shutdown()`, `db.destroy()`. `pnpm --filter @game/server
start` runs `tsx src/main.ts`.

### D10. Tests

Unit (no DB): tokens, access-code hash/verify, nickname and id patterns,
protocol schemas, Ajv options (unknown property rejected, `"1"` not coerced).
Integration (`*.int.test.ts`, Postgres, real `ws` clients against
`app.listen({ port: 0 })`, `FakeClock` for deadlines): every scenario of
handoff criterion 11. The restart test closes server A (shutdown snapshots),
builds server B on the same database, and reconnects both clients with
`Hello { lastRevision }`.

## Risks / Trade-offs

- [Access code brute force; no rate limiting] -> scrypt slows each guess;
  rate limiting is out of scope and recorded as residual risk.
- [Finished and closed rooms stay in memory until restart] -> bounded by
  stage 1 usage; eviction is later work.
- [Tokens never expire] -> accepted for guests in stage 1.
- [Lobby revision races] -> bounded retry; contention is a handful of
  players.
- [Client ignores `joinable` until TASK-s1-client-lobby] -> join of a
  playing room is rejected by the server with a clear code.

## Migration Plan

Migration 0002 is additive (drop and re-add the named check, add a nullable
column). Rollback: the code of this change requires 0002; an older server
ignores the column but would violate nothing. Archive order:
`protocol-stage-1-frames`, `server-rooms`, `engine-resignation`, then this.
