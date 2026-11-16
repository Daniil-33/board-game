# @game/server

The authoritative game server: guest login, the HTTP lobby and the WebSocket
game endpoint (Fastify) over the room core (rooms, persistence, timers,
recovery).

## Run

```sh
# from the repository root; Postgres from docker-compose.dev.yml
DATABASE_URL=postgres://game:game@127.0.0.1:54329/postgres pnpm --filter @game/server start
```

| Variable | Default | |
|---|---|---|
| `DATABASE_URL` | (required) | the process exits 1 without it |
| `HOST` | `127.0.0.1` | localhost only unless set |
| `PORT` | `8787` | the client dev proxy target |

On start the service applies pending migrations, restores every room in
`lobby` or `playing`, then listens. SIGINT/SIGTERM close every socket, drain
and snapshot the rooms, close the pool and exit 0. The client dev server
talks to it with `GAME_BACKEND=http://127.0.0.1:8787 pnpm --filter
@game/client dev`.

## Routes

Payloads are the `@game/protocol` lobby schemas; errors are `{ code, message }`.
Every route but guest login needs `authorization: Bearer <token>` (401
`UNAUTHENTICATED` otherwise, checked before the body).

| Route | |
|---|---|
| `POST /api/guests { nickname }` | 201 `{ guestId, token }`; only the token's SHA-256 is stored |
| `POST /api/rooms { accessCode? }` | 201 `{ room, accessCode?, inviteLink? }`; the code is stored as a scrypt hash |
| `GET /api/rooms` | lobby and playing rooms, plus the caller's finished ones; never closed |
| `GET /api/rooms/:roomId` | members only (403 `NOT_A_PARTICIPANT`), any status |
| `POST /api/rooms/:roomId/join { accessCode? }` | lobby only; locked rooms: 403 `ACCESS_CODE_REQUIRED` / `ACCESS_CODE_INVALID` |
| `POST /api/rooms/:roomId/leave` | lobby only; the creator leaving closes the room |
| `POST /api/rooms/:roomId/start` | creator only (403 `NOT_ROOM_CREATOR`) |
| `GET /ws` | game socket: `Hello` -> `Welcome`, `Command` -> `Ack`, `Update` per commit |

Engine rejections are 409 with the engine code; a closed room is 409
`ROOM_CLOSED`; an unknown room 404 `ROOM_UNAVAILABLE`.

Socket closes are announced by an `Error` frame first: `ROOM_CLOSED` (the
creator left), `NOT_A_PARTICIPANT` (you left), `CONNECTION_REPLACED` (a newer
socket of the same guest took the room). Closing a socket never resigns.

## Layout

- `migrations/` plain SQL, applied in name order by `migrateToLatest(db)`.
- `src/main.ts`, `src/main-config.ts` process entry and environment.
- `src/server.ts` `createServer({ db, manager })`: the Fastify app, not listening.
- `src/http/` Fastify instance (strict Ajv, error shape, request log without
  headers or bodies) and `ApiError`.
- `src/auth/` tokens, guest store, guest login, bearer authentication.
- `src/lobby/` access codes (scrypt), summary queries, lobby service and routes.
- `src/ws/` game socket connection and the per (room, guest) registry.
- `src/db/` Kysely types, `createDb(url)`, the migrator and the game store
  (log, snapshots, room status and members in one transaction).
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

The integration suites include real WebSocket clients against a listening
server (`lobby`, `game-socket`, `e2e`) and the service process itself
(`service`, spawned with `tsx`).

In agent sessions that predate the docker group change, wrap the compose
commands: `sg docker -c 'docker compose -f docker-compose.dev.yml up -d --wait'`.

## Stage 4 compatibility

The server speaks protocol 4 and runs core-6 games. Welcome and Update expose
board, economy, balances, owners, purchase decisions, auction state, houses, rent and rent quotes; public
core events pass through unchanged. BuyAsset, StartAuction, Bid and PassAuction
carry null payloads; the authenticated guest supplies the actor. A duplicate
command id returns the original Ack, while a new id with a stale response
target is rejected with TARGET_MISMATCH.

Timers follow pendingDeadlines, including the 10 second auction response and
paused/resumed turn deadlines. Purchase and auction states recover from the
snapshot and ordered log tail; overdue response deadlines fire on boot.

Migration 0005 closes existing lobby/playing rooms once, preserving logs,
snapshots and membership. Closed rows answer ROOM_CLOSED at Hello before game
loading. Unsupported core-3, core-4 or core-5 data actually opened (including a finished
room at Hello or a closed room through the manager) uses the failed-room path
with ROOM_UNAVAILABLE; active boot recovery reports that room and continues.
Protocol 1, 2 and 3 Hello frames are refused before authentication.

PayRent carries null. BuildHouse and SellHouse carry exactly
`{ assetId: string }` (1–128 UTF-16 units, no NUL or lone surrogates).
Core error codes are returned unchanged in rejected Acks. Rent uses the existing
turn deadline; timeout auto-payment and open settlements recover normally.

## Test fixtures

Enable only in isolated test environments with `NODE_ENV=test E2E_FIXTURES=1`.
Startup and direct server construction reject opt-in with any other NODE_ENV,
naming E2E_FIXTURES. Without opt-in the route is absent. Deployment configurations
do not enable it.

First create 2–6 guests through POST /api/guests. Supply their distinct tokens
in seat order (the first guest is the room creator):

```http
POST /api/test/fixtures
Content-Type: application/json

{"fixture":"open-rent","tokens":["<guest-a-token>","<guest-b-token>","<guest-c-token>"]}
```

The response is HTTP 201 `{ "roomId": "..." }`. All tokens authenticate existing
guests; no extra authorization header is needed for this test-only endpoint.
Unknown names, duplicate tokens or invalid body shapes return 400 INVALID_REQUEST;
unknown tokens return 401 UNAUTHENTICATED. Clients cannot supply a state or path.
Connect each guest normally through /ws with a protocol 4 Hello for that roomId.

Builders are importable from `apps/server/src/test-fixtures.ts`:
`buildFixture(name, guestIds, now)` returns an invariant-checked core-6 GameState.
The fixture uses seed 42, deterministic setup, actual guest identities and host
time for deadlines. The active player is given by state.turn.playerId; callers
should read the Welcome rather than assume the creator is active.

| Name | State |
|---|---|
| regular-rent | Open regular rent on one opponent-owned asset |
| full-group-rent | Open rent on an opponent's full regular group |
| logistics-rent | Open rent with two opponent-owned logistics assets |
| energy-rent | Open energy rent for a dice sum of 7 |
| own-asset | Rolled turn on the active player's asset, no rent |
| shortfall | Open regular rent with payer balance 10 |
| building | Unrolled turn with a complete regular group owned by the active player |
| open-rent | Open regular settlement for restart/deadline scenarios |

The full state is persisted atomically with the room and membership as its
genesis snapshot at the state's actual revision. No historical commands are
fabricated. Subsequent intents use the normal authenticated room pipeline and
log; recovery uses the genesis snapshot plus that tail. Builders derive quotas
from core setup and never override bonus-turn quota behavior.
