# Team Lead -> Engineer Task Handoff

```yaml
id: TASK-s1-server-api
revision: 1
effort: EFF-stage-1-skeleton
project: economic-board-game
source_commit: main after TASK-s1-server-rooms merges
owner: team-lead
status: proposed # lobby leave/discovery rules pending owner answer, see Escalation
```

## Outcome

`apps/server` becomes a runnable Fastify service: guest login, the lobby HTTP
API and the WebSocket game endpoint on top of the room module from
`TASK-s1-server-rooms`, so real browser clients can play stage 1 end to end.

## Acceptance criteria

Product (handoff criteria 1, 8, 9):

1. Guest login `POST /api/guests { nickname }` -> `{ guestId, token }`.
   The server stores only a hash of the token. The server generates
   `guestId`; it is also the core `playerId`.
2. Lobby (all require `Authorization: Bearer <token>`):
   `POST /api/rooms` creates a room (core `CreateGame` with a CSPRNG seed,
   creator added as the first member through `AddPlayer`);
   `GET /api/rooms` lists joinable rooms (status `lobby`);
   `POST /api/rooms/:roomId/join` adds the caller (`AddPlayer`), at most 6;
   `POST /api/rooms/:roomId/start` (creator only, at least two members)
   runs `StartGame`. Responses and errors follow `@game/protocol` lobby
   schemas (`NOT_ROOM_CREATOR`, `INVALID_REQUEST`, engine codes passed through).
3. WebSocket `GET /ws`: the first frame must be `Hello`; the server checks
   the protocol version, the token and room membership, then replies
   `Welcome` with the caller's projection. `Hello` is accepted for rooms in
   lobby and in play. Lobby changes (`PlayerAdded`, `GameStarted`) and game
   changes reach every connected member as `Update` (full projection plus
   projected events).
4. `Command` frames: the server sets the actor from the socket's guest,
   submits to the room, and answers `Ack` after persistence; duplicate
   `commandId` returns the original `Ack`.
5. Reconnect: a new socket with `Hello { lastRevision }` gets `Welcome` with
   the current view; an older socket for the same guest and room is closed.
6. The service listens on `127.0.0.1` by default; host/port/DB URL from
   environment variables.

Technical proof:

7. Fastify's Ajv is configured with `removeAdditional: false` and
   `coerceTypes: false`, and `NICKNAME_FORMAT` from `@game/protocol` is
   registered (protocol review RVW-005). Unknown properties are rejected.
8. Nickname rule fix (protocol review RVW-007): `isValidNickname` in
   `packages/protocol` additionally requires at least one code point that is
   not U+200C/U+200D and forbids leading or trailing joiners; tests added.
9. Integration tests with a real Postgres and real WebSocket clients: two
   and three guests through lobby, start, setup and several turns; unknown
   property rejected; non-member `Hello` rejected; reconnect after socket
   drop; server restart mid-game with clients reconnecting to the restored
   room.

## Scope and non-goals

In scope: `apps/server/src/{http,ws,auth,lobby,main}` and its tests,
`packages/protocol/src/nickname.ts` plus its tests (criterion 8 only).

Not in scope: room executor internals (rooms task), Dockerfiles and Compose
(compose-e2e task), Playwright browser scenarios, accounts/OAuth, rate
limiting, public exposure, leaving a lobby (pending owner answer).

## Canonical references

- `docs/efforts/stage-1-skeleton.md` rev 2; `docs/efforts/stage-1-skeleton/design.md` § "Server", § "Protocol".
- `packages/protocol` (`openspec/changes/protocol-stage-1-frames`).
- `openspec/changes/client-stage-1-skeleton` for the routes the client calls.
- Room interface from `TASK-s1-server-rooms`.

## Constraints and invariants

Server is authoritative. The actor always comes from the authenticated socket,
never from the frame. Write order is owned by the room module; the API never
broadcasts before the room's commit callback. Bind to localhost only.

## Dependencies

Requires `TASK-s1-server-rooms` merged. The client task uses these routes
against a mock; the compose-e2e task joins them.

## Delegated decisions

Plugin layout, token format (opaque random), hashing (SHA-256 of a 32-byte
random token is enough), connection registry, error mapping details.
Return to the Team Lead for any new route or frame field.

## Required workflow

Explore -> Propose (OpenSpec change, report with `--wake`) -> Team Lead
approval -> Apply in a fresh context -> Verify -> PR -> Review fixes.

## Required checks

`pnpm build`, `pnpm test` with Postgres locally and in CI, `git diff --check`
over the range, a manual run with two `wscat` or test clients.

## Escalation conditions

Open owner question (via CTO): how rooms are found and whether members may
leave a lobby before start. Until answered: list joinable rooms, no leave.
Any other lobby rule not listed above; room interface insufficient.

## Deliverables

Fastify service, tests, OpenSpec change, branch `agent/task-s1-server-api`,
PR, CI evidence, independent review report, residual risks.

The Engineer accepts the exact revision before editing. A material change
creates a new revision.
