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
| `GET /ws` | game socket: `Hello` -> `Welcome` (with history), `Command` -> `Ack`, `Update` per commit, `ChatSend` -> `Chat` to every connection, then `ChatAck` |

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

## Stage 5 compatibility

The server runs core-7 games. Welcome and Update expose
board, economy, balances, owners, purchase decisions, auction state, houses, rent,
rent quotes, mortgages (with remainingLaps), eliminations and, once finished, the
result; public core events (including AssetMortgaged, AssetRedeemed,
MortgageExpired, LiquidationApplied, PlayerBankrupt, AssetsReleased and GameEnded)
pass through unchanged. BuyAsset, StartAuction, Bid, PassAuction and PayRent
carry null payloads; the authenticated guest supplies the actor. A duplicate
command id returns the original Ack, while a new id with a stale response
target is rejected with TARGET_MISMATCH.

BuildHouse, SellHouse, Mortgage and Redeem carry exactly `{ assetId: string }`
(1–128 UTF-16 units, no NUL or lone surrogates). Core error codes are returned
unchanged in rejected Acks.

## Chat and Welcome history (protocol 6)

The server speaks protocol 6. `ChatSend { clientMsgId, text }` is handled on the
room's serial queue with commands: the author must be a player of the room
(eliminated players included); the trimmed text follows `checkChatText` from
`@game/protocol` (1-300 code points, no control character other than newline,
at most 4 lines); each author may have 5 accepted messages per 10 s and one per
500 ms (in memory, reset on restart). An accepted message is stored in
`chat_messages` (migration 0007), sent as `Chat` to every connection of the
room and only then answered `ChatAck { ok: true }`; every rejection is
`ChatAck { ok: false, reason }`. Chat never enters the game log, snapshots or
replay.

`Welcome.history` holds the last 200 log entries as `{ revision, at, events }`
(`at` is the entry's transition time; events filtered by the same per-viewer
projection as `Update`, emptied entries dropped) and the last 200 chat messages,
both oldest first. History and the socket's subscription are taken in one step of
the room queue, so nothing is both in the history and in a later frame.

Timers follow pendingDeadlines, including the 10 second auction response and
paused/resumed turn deadlines. Purchase, auction, rent and mortgage states recover
from the snapshot and ordered log tail; overdue deadlines fire on boot. Finished
rooms are not restored at boot; they load on demand at Hello, serve their final
view to every member (eliminated players included) and arm no timers.

An accepted command whose events include GameEnded inserts one `game_results`
row (room, core rules version, winner, finish time, final revision, ordered
eliminations, final balances) in the same transaction as its log row, the
finished room status and the final snapshot, before anything is broadcast. A
failure rolls all of them back and the command is rejected with
PERSISTENCE_FAILED.

Migrations 0005 and 0006 each close the then existing lobby/playing rooms once,
preserving logs, snapshots and membership. Closed rows answer ROOM_CLOSED at
Hello before game loading. Unsupported core-3 to core-6 data actually opened
(including a finished room at Hello or a closed room through the manager) uses
the failed-room path with ROOM_UNAVAILABLE; active boot recovery reports that
room and continues. Protocol 1 to 4 Hello frames are refused before
authentication.

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
Connect each guest normally through /ws with a protocol 6 Hello for that roomId.

Builders are importable from `apps/server/src/test-fixtures.ts`:
`buildFixture(name, guestIds, now)` returns an invariant-checked core-7 GameState.
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

Stage 5 fixtures. The payer is the active player (state.turn.playerId); the
creditor is the next seat in turn order. The payer's holdings come from the
cheapest regular group, the creditor's from the most expensive one.

| Name | State | Next command |
|---|---|---|
| mortgage-expiry | Rolled turn; the payer's one mortgage has 7 laps done and only the payer pending | EndTurn (or the turn Timeout) emits MortgageExpired |
| liquidation-tier-1 | Open rent on the creditor's full group; payer cash is rent − 10 and it owns one asset of an incomplete group | PayRent mortgages that asset (tier 1) |
| liquidation-tier-2 | As tier 1, but the payer owns a complete group without houses | PayRent mortgages in the complete group (tier 2) |
| liquidation-tier-3 | As tier 2, with one house on every asset of the group | PayRent sells a house (tier 3) |
| bankruptcy | Open rent; payer has cash 10 and one already mortgaged asset | PayRent: PlayerBankrupt, creditor receives 10, the asset is released; with 3+ seats play continues |
| final-bankruptcy | As bankruptcy, after every seat other than payer and creditor resigned through the core (still members) | PayRent ends the game: GameEnded and a game_results row |
| mortgage-restart | Rolled turn; payer mortgage at 7 laps (only the payer pending), creditor mortgage at 3 laps (everyone pending) | Restart, then EndTurn expires one term and advances the other |

The full state is persisted atomically with the room and membership as its
genesis snapshot at the state's actual revision. No historical commands are
fabricated. Subsequent intents use the normal authenticated room pipeline and
log; recovery uses the genesis snapshot plus that tail. Builders derive quotas
from core setup and never override bonus-turn quota behavior.
