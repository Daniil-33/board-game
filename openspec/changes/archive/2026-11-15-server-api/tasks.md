# Tasks

Apply starts in a fresh context after Team Lead approval and after PR #18
(engine-resignation) merges: rebase `agent/task-s1-server-api` on `main`
first. After each group: `pnpm build`, `pnpm test`, and for server groups
`pnpm --filter @game/server test:integration` (local Postgres:
`sg docker -c 'docker compose -f docker-compose.dev.yml up -d --wait'`).

## 1. Protocol (spec: protocol/frames, protocol/lobby)

- [x] 1.1 Storable id pattern on every id and command id schema (design D8).
  Verify: frames/hostile tests for `\u0000`, lone high and low surrogates,
  astral pair accepted.
- [x] 1.2 Nickname rule RVW-007 (`nickname.ts`). Verify: scenarios
  "Joiners only or at the edges" and the existing ones.
- [x] 1.3 `Resign` in `CLIENT_COMMAND_TYPES`; `ROOM_CLOSED`,
  `CONNECTION_REPLACED`, `ACCESS_CODE_REQUIRED`, `ACCESS_CODE_INVALID`.
  Verify: "Resign frame", "System command refused", "New codes exported".
- [x] 1.4 Lobby schemas: access code, create/join requests, create response
  with `accessCode` / `inviteLink`, get/leave responses, summary `locked` /
  `joinable`, four statuses. Verify: "Access code bounds", "Summary flags
  required", extra-field tests for each new schema.
- [x] 1.5 Client fixture literals only (proposal decision 7):
  `apps/client/src/__tests__/helpers.ts`, `apps/client/mock/server.ts`.
  Verify: `pnpm --filter @game/client test` and typecheck unchanged otherwise.
  Done with two type/fixture-only additions reported to the Team Lead:
  `lobby.test.ts` malformed example `finished` -> `archived`; `Resign` in
  `ClientCommandType` required `TurnCommandType` for `ActionAvailability`
  (`src/game/view.ts`, `ActionButtons.vue`, `view.test.ts`).

## 2. Persistence and room module (spec: server/persistence, server/rooms)

- [x] 2.1 `migrations/0002_lobby.sql`, `schema.ts` statuses and
  `access_code_hash`. Verify: migrate test "Upgrade from 0001" and "Unknown
  status" with the new set.
- [x] 2.2 `AppendOptions { status, members, snapshot }` in the store;
  room derives `playing` / `finished` / members from committed states and
  snapshots on finish (design D4). Verify: "Game finished", "Members follow
  the log" (including failed insert), existing server-rooms suites green.
- [x] 2.3 `submit(command, { closeRoom })`, `closed` RoomEvent. Verify:
  "Close on accept", "Close on reject".

## 3. HTTP foundation and auth (spec: server/auth, lobby "Strict request validation")

- [x] 3.1 `http/app.ts`, `http/errors.ts`: Ajv options, nickname format,
  error mapper (design D6). Verify: "Unknown property", "No coercion",
  malformed JSON -> 400.
- [x] 3.2 `auth/tokens.ts`, `auth/guests.ts`, `auth/routes.ts`. Verify: unit
  tests for token/id shape and hash; int tests "Login", "Two logins",
  "No plain token at rest", "Unknown token".

## 4. Lobby (spec: server/lobby)

- [x] 4.1 `lobby/access-code.ts` (scrypt). Verify: unit hash/verify, wrong
  code, malformed stored hash fails closed.
- [x] 4.2 `lobby/queries.ts`: list and get summaries (design D5). Verify:
  "Statuses in the list", "Late joiner nickname", non-member 403.
- [x] 4.3 `lobby/service.ts`, `lobby/routes.ts`: create, join, leave,
  start, revision retry (design D3). Verify: "Open room", "Locked room",
  "Right and wrong code", "Seventh guest", "Member leaves", "Creator alone",
  join after start -> 409, leave after start -> 409, concurrent joins of
  five guests all succeed.

## 5. Game socket (spec: server/game-socket, lobby "Creator leaves")

- [x] 5.1 `ws/registry.ts`, `ws/connection.ts`, `ws/routes.ts` (design D7).
  Verify: "Non-member", "Command before Hello", Hello timeout, wrong
  protocol version, unknown token, closed room.
- [x] 5.2 Commands, `Ack`, `Update` fan-out. Verify: "Unknown property",
  "Duplicate delivery", "Join seen in lobby".
- [x] 5.3 Replacement and removal. Verify: "Drop and reconnect",
  `CONNECTION_REPLACED` to the older socket, "Leaver's socket",
  "Creator leaves".

## 6. Service and end-to-end (spec: server/service, criterion 11)

- [x] 6.1 `server.ts`, `main.ts`, `pnpm start` (tsx). Verify: "Default
  bind" (address of the listening socket), missing `DATABASE_URL` exits 1.
- [x] 6.2 E2E int tests with real `ws` clients: two and three guests through
  lobby, start, setup and turns (FakeClock for a timeout); resign on own turn
  and on another's turn down to a winner ("Resign down to a winner");
  "Finished room"; "Server restart" with clients reconnecting.
- [x] 6.3 Manual run: `pnpm --filter @game/server start` plus the client dev
  server (`GAME_BACKEND=http://127.0.0.1:8787`) in two browsers: login,
  create, join, start, play turns, reload one tab. Record in the task report.
  Done with two Chromium contexts (Playwright image) through the client dev
  proxy against `pnpm start`; see the task report.

## 7. Delivery

- [x] 7.1 `apps/server/README.md` (run, env, routes); `git diff --check`
  over the range; PR; CI green on the exact head; independent review.

## Delivery evidence reconciled for archive

TASK-s1-server-api history: README and range diff checked; PR #20 head 3a97f27, REV-s1-server-api-1 PASS, CI 43753621012; merged 25fef63.

Post-merge archive correction (REV-s1-compose-e2e-2 RVW-002): copied the accepted
post-sync requirement normalizations verbatim from main specs into the archived
MODIFIED blocks. This preserves semantics and makes archive replay reproduce the
normalized main specs. Engine-resignation covers Invariant enforcement and Game
phases; server-api covers Lobby authentication and errors and Technical nickname
rules. RVW-003 (rewriting generic scenarios) remains deferred by Team Lead.
