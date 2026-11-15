# Proposal

## Why

Stage 1 ("Сквозной скелет", ROADMAP.md) needs real browser clients to play
end to end. The room core exists (`openspec/changes/server-rooms`, PR #15),
the protocol (`protocol-stage-1-frames`) and the client
(`client-stage-1-skeleton`) exist, but nothing serves them: there is no HTTP
lobby, no guest login and no game socket. Effort handoff
`docs/efforts/stage-1-skeleton.md` rev 3 criteria 1, 1a-1c, 8 and 9 add an
optional room access code, leaving before start (creator leaving closes the
room) and resignation during play down to a winner.

GAME-BREAKDOWN.md § "Принятые технические границы и текущая реализация"
requires the server to be authoritative (actor from the session, the core
free of I/O). § "MVP: что входит и что отложено" lists guest entry, rooms,
reconnect and timeouts as MVP infrastructure. No game rule is added here.

Task handoff: `TASK-s1-server-api` rev 2; Team Lead design
`docs/efforts/stage-1-skeleton/design.md` § "Server", § "Protocol".

## What Changes

- `apps/server` becomes a runnable Fastify service (`fastify`,
  `@fastify/websocket`, `tsx` for `pnpm start`): `src/main.ts` reads
  `HOST` (default `127.0.0.1`), `PORT` (default `8787`, the client dev proxy
  target) and `DATABASE_URL`, migrates, restores rooms, listens; SIGINT and
  SIGTERM shut down cleanly.
- `src/auth`: guest login. Token = 32 CSPRNG bytes base64url; the database
  holds only its SHA-256. `guestId` is server generated and is the core
  `playerId`.
- `src/lobby`: create (optional access code, scrypt hash only), list, get,
  join, leave, start, mapped onto core `CreateGame`, `AddPlayer`,
  `LeaveLobby`, `StartGame` (system actor).
- `src/ws`: `GET /ws`; `Hello` -> `Welcome`, `Command` -> `Ack`, `Update`
  broadcast with per-viewer projection, reconnect replaces an older socket
  of the same guest and room, `Resign` as a client command.
- `src/http`: Fastify app factory with Ajv `removeAdditional: false`,
  `coerceTypes: false`, the nickname format registered; one error mapper.
- Room module (status transitions only): the log transaction also sets
  `rooms.status` to `finished` when the core phase becomes `finished`, keeps
  `room_members` equal to the core player list, and sets `closed` when the
  API submits the creator's `LeaveLobby` with `closeRoom`. A closed room
  stops accepting commands and emits `closed`.
- Migration `0002_lobby.sql`: statuses `finished` and `closed`, nullable
  `rooms.access_code_hash`.
- `packages/protocol`: access-code and invite fields, `locked` / `joinable`
  flags, statuses `finished` / `closed`, get-room and leave schemas, `Resign`
  in the client command union, codes `ACCESS_CODE_REQUIRED`,
  `ACCESS_CODE_INVALID`, `ROOM_CLOSED`, `CONNECTION_REPLACED`; ids reject U+0000 and lone
  surrogates; nickname rule fix (RVW-007).
- Integration tests with Postgres and real WebSocket clients.

## Capabilities

### New Capabilities

- `server/auth`: guest login, token hashing, bearer authentication.
- `server/lobby`: room create/list/get/join/leave/start, access codes.
- `server/game-socket`: Hello/Welcome, commands, updates, reconnect, close.
- `server/service`: process entry, configuration, bind address, shutdown.

### Modified Capabilities

- `server/rooms` (from `server-rooms`): room closing, `closed` event.
- `server/persistence` (from `server-rooms`): schema statuses, access-code
  column, status and membership follow the log.
- `protocol/lobby`, `protocol/frames` (from `protocol-stage-1-frames`).

## Decisions for Team Lead approval

Rationale in `design.md`.

1. **List visibility (CTO 1a, RVW-005).** `GET /api/rooms` returns every room
   in `lobby` or `playing`; `joinable` is true only in `lobby` with seats
   left and no access code. A member's own rooms are included even when
   `finished`, so a reloaded client can show its result; `closed` rooms are
   never listed. Recommended; alternative: own `finished` rooms hidden too.
2. **Access code format.** Chosen by the creator in the create request,
   4-32 characters `[A-Za-z0-9_-]` (URL-safe, typeable). The create response
   echoes it with `inviteLink: "/?room=<roomId>&code=<code>"`, a relative
   link because the server does not know its public origin. Both fields are
   present only for a locked room. A member of a locked room needs no code
   to `Hello` or get-room.
3. **Room-module interface extension.** `Room.submit(command, options?)`
   with `options.closeRoom` and a `closed` `RoomEvent` (design D4). This is
   the only interface change; status `finished` and `room_members` are
   derived from the committed state, like `playing` today.
4. **Leave response** `{ room }`: the summary after leaving (status `closed`
   when the creator left). Join and leave accept a missing body as `{}`, so
   the current client keeps working.
5. **Close notice.** Connected members of a closing room get the `Update`
   of the creator's `LeaveLobby`, then `Error { code: 'ROOM_CLOSED' }`, then
   the socket closes. No new frame type.
6. **Migrate on boot.** `main.ts` runs `migrateToLatest` before listening;
   no separate migration CLI (Compose task can still add one).
7. **Consumer fixtures.** The new required `locked` / `joinable` summary
   fields break the client's `RoomSummary` literals. Authorize adding the two
   fields (and the wider status union in the mock's type) in
   `apps/client/src/__tests__/helpers.ts` and `apps/client/mock/server.ts`
   only; no client behavior change. Alternative: make the fields optional,
   which weakens the contract the client lobby task will build on.
8. **`CONNECTION_REPLACED`.** An older socket of the same guest and room
   is told `Error { code: 'CONNECTION_REPLACED' }` before it is closed. The
   handoff lists no such code; without it the current client, which
   reconnects after every close it does not recognize as final, would make
   two tabs of one guest replace each other in a loop (design D7). The
   client must stop reconnecting on it and on `ROOM_CLOSED`
   (TASK-s1-client-lobby).

## Dependencies

Apply of leave and resign uses `LeaveLobby` (system actor, payload
`{ playerId }`, revision guard) and `Resign` (player actor, payload `null`,
revision guard), phase `finished`, `winner`, events `PlayerLeftLobby`,
`PlayerResigned`, `GameEnded`, `CURRENT_RULES_VERSION = 'core-3'`, as
published by `openspec/changes/engine-resignation` (PR #18). Apply rebases on
`main` after PR #18 merges; the Team Lead relays any name change.

## Impact

- `apps/server/**` (new `src/{http,auth,lobby,ws}`, `src/main.ts`,
  migration 0002, small changes in `src/rooms`, `src/db`), `packages/protocol/**`,
  `pnpm-lock.yaml`.
- `apps/client`: only the fixture and mock literals of decision 7. The
  client checks responses with the protocol schemas, so it picks up the new
  protocol in the same commit; the lobby UI for codes, leave, resign and the
  `joinable` flag is TASK-s1-client-lobby. Until then the current client
  still logs in, creates, joins (unlocked rooms) and starts.
- CI already runs `pnpm test:integration` with Postgres.

## Out of Scope

- Core rules (TASK-s1-core-resign), client UI (TASK-s1-client-lobby),
  Dockerfiles, Compose stack, Playwright (TASK-s1-compose-e2e).
- Accounts, token expiry or revocation, rate limiting (brute force of access
  codes is a residual risk), CORS, TLS, public exposure.
- Room executor internals beyond the status transitions above; evicting
  finished or closed rooms from memory; a player who never reconnects
  (stage 8); spectators.
