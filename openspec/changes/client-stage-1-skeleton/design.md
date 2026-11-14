# Design

## Context

Requirements: `specs/`. Sources: task handoff `TASK-s1-client` revision 1,
effort handoff criteria 1, 8, 9, 11, Team Lead design § "Client" and
§ "Protocol", `packages/protocol` (merged), `engine-turn-cycle` on
`agent/task-s1-core-turns` (PR #7, not merged at proposal time).

Facts found in Explore that shape the design:

- `StateView` after core-turns is `{ revision, rulesVersion, phase, players:
  [{ id }], setup, order, turn, positions, jail }`. It carries player ids
  only, no nicknames and no server clock.
- `setup` (phase `setup`) has `setupRollId`, `playerId`, `deadline`, `groups`,
  `round { pending, rolls }`. `turn` (phase `playing`) has `turnId`,
  `playerId`, `deadline`, `bonus`, `rolled`, `continuation`, `doublesStreak`,
  `pendingBonus`, `quotas`.
- Commands use target expectations: `RollForOrder` ->
  `{ kind: 'setupRoll', id: setup.setupRollId }`; `RollDice`, `EndTurn` ->
  `{ kind: 'turn', id: turn.turnId }`.
- Events: `OrderRollStarted`, `OrderDieRolled`, `OrderTied`,
  `TurnOrderDetermined`, `TurnStarted`, `DiceRolled`, `PlayerMoved`,
  `TurnContinued`, `TurnEnded`, `SentToJail`, `InterimJailAttemptFailed`,
  `InterimJailReleased`, plus lifecycle `PlayerAdded`, `GameStarted`.
- The core session is idempotent per `commandId` (same command -> same
  result, different command -> `COMMAND_ID_CONFLICT`), so resending an
  unacknowledged command is safe.
- The protocol defines lobby schemas but no HTTP paths, methods or WebSocket
  URL, no "get one room" operation and no lobby push.
- The root `build` script is `pnpm -r exec tsc --noEmit`; plain `tsc` does
  not check `.vue` files. The lockfile has vitest 2.1.9 with vite 5.4.

## Decisions

### D1. Module layout

```
apps/client/
  index.html, vite.config.ts, vitest.config.ts
  src/
    main.ts, App.vue
    api/routes.ts        HTTP paths and WS URL in one place (D5)
    api/lobby.ts         fetch wrappers; responses checked with protocol schemas
    net/connection.ts    WebSocket lifecycle, Hello/Welcome, outbox, reconnect
    net/socket.ts        minimal socket interface so tests inject a fake
    store/session.ts     guest identity, current room, localStorage
    store/game.ts        latest view, playerId, rejected-Ack messages
    client.ts            wires stores, API, connection and animation queue; all I/O injected
    game/view.ts         pure selectors over the view (HUD model)
    game/animation.ts    event -> animation step queue (no PixiJS import)
    board/layout.ts      cell index -> canvas coordinates
    board/BoardCanvas.ts PixiJS scene: ring, tokens, dice; plays animation steps
    screens/LoginScreen.vue, LobbyScreen.vue, RoomScreen.vue, GameScreen.vue
    components/Hud.vue, TurnOrder.vue, TurnTimer.vue, ActionButtons.vue
  mock/script.ts (dice), mock/game.ts (scripted game), mock/server.ts (lobby + socket),
  mock/main.ts (HTTP + WebSocket entry)
```

State management is plain Vue reactivity (`reactive` / `ref` modules); two
small stores do not justify Pinia. No router: `App.vue` picks the screen from
store state (no guest -> login; guest without room -> lobby; room in view
phase `lobby` -> room; phase `setup` or `playing` -> game).

### D2. Core types

Core-turns (PR #7) merged before Apply started, so the planned local stub file
was never created: the client imports the real types from `@game/game-core`
with `import type`. `StateView` is already the stage 1 view, so no narrowing
function is needed. The only value imports are pure constants:
`PLACEHOLDER_RING` (ring layout) and the target kinds `TURN_TARGET_KIND` and
`SETUP_ROLL_TARGET_KIND` (used to build `expected`, instead of repeating the
strings). `src/__tests__/boundary.test.ts` fails on any other value import
from game-core, and the production bundle is checked to contain no engine
code.

### D3. Connection, commands, reconnect

`connection.ts` owns one WebSocket per joined room.

- On open: send `Hello { protocolVersion: PROTOCOL_VERSION, token, gameId,
  lastRevision }` where `lastRevision` is the revision of the last view held
  in memory, or `null` (first connect, tab reload).
- Every message goes through `decodeServerFrame`. A decode failure is logged
  and shown as a connection problem; the frame is dropped.
- `Welcome`: store `playerId`, replace the view, mark connected, then resend
  the outbox. `Update`: replace the view if `revision` is greater than the
  held one, and hand `events` to the animation queue. An `Update` at or below
  the held revision is ignored.
- `sendCommand(type)`: builds `{ t: 'Command', commandId, type, expected,
  payload: null }` with `commandId = crypto.randomUUID()` and the target
  expectation read from the current view. The frame never has `actor`. The
  command is put in the outbox and sent if connected.
- `Ack`: removes the command from the outbox. `rejected` adds
  `{ code, message }` to the HUD message list (the last five are kept). An `Ack` for an
  unknown `commandId` is ignored.
- Reconnect: on close or error, retry with backoff 0.5 s, 1 s, 2 s, 4 s,
  capped at 5 s, until the room is left. After the next `Welcome` the outbox
  is resent unchanged, same `commandId` and `expected`. A stale command is
  then rejected by the target guard and the rejection is shown.
- `Error` frame: `UNAUTHENTICATED` clears the stored guest and returns to
  login; `NOT_A_PARTICIPANT` and `ROOM_UNAVAILABLE` clear the stored room and
  return to the lobby, which shows the reason as a notice until the next room; `PROTOCOL_VERSION_UNSUPPORTED` stops reconnecting and
  shows a reload notice. Other codes are shown and reconnect continues.
- While a command of some type is in the outbox, its button is disabled, so a
  double click cannot issue two commands.

### D4. Player names (view gap)

The view has player ids only. The client shows nicknames from
`RoomSummary.members`, matching `member.guestId` to the view's player id, and
falls back to the raw id when there is no match. The member list of the
current room is cached in `localStorage` with the room id so a tab reload
mid-game keeps the names. The Team Lead confirmed that the server uses the
lobby guest id as the core `playerId` (no new protocol field).

### D5. Lobby transport and room view

The protocol fixes the lobby payloads, not the routes. The client keeps
every path in `api/routes.ts`; the mock imports the same table. The Team Lead
fixed these as the canonical routes; the server-api task implements exactly
them:

| Operation | Request |
|---|---|
| guest login | `POST /api/guests` |
| create room | `POST /api/rooms` |
| list joinable rooms | `GET /api/rooms` |
| join room | `POST /api/rooms/:roomId/join` |
| start game | `POST /api/rooms/:roomId/start` |
| game socket | `GET /ws` (WebSocket upgrade) |

In dev, Vite proxies `/api`, `/ws` and the mock-only `/mock` to the mock, so the client always uses
same-origin relative URLs and needs no configuration in Compose.

Responses are checked with the protocol's TypeBox schemas (`Value.Check`); a
mismatch is reported as an error, not rendered.

There is no "get room" operation and no lobby push, so the room view learns
about new members and the game start from the game socket: on entering a
room (create or join) the client connects with `Hello`; the view's `players`
and `phase` drive the member list, the Start button (`players.length >= 2`
and `room.creatorId === guestId`) and the switch to the game screen when
`phase` leaves `lobby`. When the view's players include an id missing from
the cached member list, the client refetches the room list once to pick up
the nickname. The Team Lead approved this: the server-api handoff requires the server to
accept `Hello` from members of a room in phase `lobby` and to broadcast
`Update` for `PlayerAdded` / `GameStarted`.

### D6. Timer

`game/view.ts: activeDeadline(view)` returns `setup.deadline` in phase
`setup`, `turn.deadline` in phase `playing`, else `null`.
`remainingMs(deadline, now) = max(0, deadline - now)`. `TurnTimer.vue` takes
`deadline` and `now` as props and shows whole seconds, rounded up; the game
screen ticks `now` every 250 ms from the injected clock, and the same `now`
disables the buttons at the deadline. There is no local 45 s constant: a
`TurnContinued` deadline or a reconnect mid-turn shows the right value
because only the view's deadline is read.

The client clock is compared with a server timestamp. The protocol carries
no server time, so a skewed client clock shifts the display (never the
rules: the server decides acceptance). Recorded as a residual risk; fixing it
needs a protocol field and is not part of this change.

### D7. HUD model

Pure selectors in `game/view.ts`, the only place that decides enablement:

- `canRollForOrder`: phase `setup` and `setup.playerId === me`.
- `canRollDice`: phase `playing`, `turn.playerId === me`, `!turn.rolled`.
- `canEndTurn`: phase `playing`, `turn.playerId === me`, `turn.rolled`.
- each also requires: connected, no command of that type in the outbox,
  and `now < deadline`.
- `turnOrder`: `view.order` in phase `playing`; in phase `setup` the
  flattened `setup.groups` with each player's roll from `round.rolls` when
  present and a "tied" mark for groups longer than one.
- `activePlayerId`: `setup.playerId` or `turn.playerId`.
- jail badge from `view.jail[playerId]` with `attemptsUsed`, labelled
  "interim rule".

The selectors mirror the engine's guards only to grey out buttons; the
server's `Ack` stays the single source of acceptance, and its rejections are
shown.

### D8. Animation queue

`game/animation.ts` turns each `Update.events` array into ordered steps and
plays them strictly one after another across updates (FIFO):

| Event | Step |
|---|---|
| `OrderDieRolled` | single die shows `value` for the player |
| `DiceRolled` | two dice tumble, settle on `dice` |
| `PlayerMoved` | token hops cell by cell from `from` for `steps` cells, wrapping at 40 |
| `SentToJail` | token moves directly to `to` (no cell-by-cell walk) |
| `InterimJailAttemptFailed`, `InterimJailReleased` | short text banner |
| `TurnStarted`, `OrderRollStarted` | highlight the active player |
| others | no step |

Unknown event types produce no step and never throw. Token positions on the
canvas come from the animation while it runs; when the queue drains, and on
every `Welcome`, tokens snap to `view.positions`, so the canvas cannot drift
from the server. On `Welcome` the queue is cleared (no delta replay in stage
1). The queue takes a `play(step): Promise<void>` function, so the ordering
test uses a recording fake and no PixiJS. Timings: die 600 ms, hop 150 ms per
cell; if more than 20 steps are waiting, remaining steps play at 4x speed.

### D9. Board rendering

`board/layout.ts` maps cell index 0..39 to a square ring, 11 cells per side,
start cell bottom-right, clockwise. `BoardCanvas.ts` (PixiJS 8) draws the
cells, marks the start and jail cells, draws a "PLACEHOLDER BOARD (stage 2
replaces it)" caption in the centre, one coloured token per player (colour
by index in `view.players`; several tokens on a cell are offset), and two
dice in the centre. A player in `view.jail` is drawn inside the jail cell's
inner box. `GameScreen.vue` mounts the canvas and passes view and steps; no
Vue reactivity inside the scene.

### D10. Tooling

- Vite 5.4 and `@vitejs/plugin-vue` 5, matching the vite that vitest 2.1.9
  already resolves, so the workspace has one vite. Vue 3.5, PixiJS 8,
  `@vue/test-utils` 2, `happy-dom` as the vitest environment. All support
  Node 22.
- Single-file components with `<script setup lang="ts">`. They are
  typechecked by `vue-tsc --noEmit`, which is the client's `typecheck`
  script. The root `build` script runs `tsc --noEmit` in every package and
  would skip `.vue` files. The Team Lead approved changing the root
  script to `pnpm -r run typecheck` (every package already defines
  `typecheck` as `tsc --noEmit`, so the others are unchanged; CI keeps
  calling `pnpm build`). This is the one line outside `apps/client/**`.
- Scripts: `dev` (vite), `mock` (mock server), `build:bundle`
  (`vite build`), `typecheck`, `test`.
- PixiJS smoke test: `BoardCanvas` is constructed against a stubbed
  renderer-free scene graph (containers only, no WebGL) and asserted to hold
  40 cells and one token per player.

### D11. Mock server

`pnpm --filter @game/client mock` runs `mock/main.ts` with `vite-node` (dev
dependency `ws`, port `MOCK_PORT`, default 8787). `mock/server.ts` is the
network-free core, so a vitest drives it directly: an in-memory lobby on the
routes of D5 and a socket handler that decodes with `decodeClientFrame`,
answers `Hello` with `Welcome`, and for each command checks the target
expectation, whose turn it is and the deadline, then sends `Ack` and an
`Update` built by `mock/game.ts` from the dice in `mock/script.ts`. A resent
`commandId` gets its first `Ack` again. The script holds a fixed
dice sequence chosen to show: an order-roll tie and reroll, a normal move, a
double with a bonus turn, a third double to jail, a failed jail attempt and
a release. Other seats are played by the mock after a short delay: a bot joins a room
the human creates, and a seeded bot-hosted room starts by itself after the
human joins. Deadlines are armed like on the real server, so an idle human
gets `auto` rolls and `TurnContinued`; `MOCK_TURN_MS` shortens them.
`POST /mock/drop` closes the sockets to demo reconnect.
The mock is explicitly not a rules implementation and is excluded from the
bundle and from `src/`.

## Risks / Trade-offs

- Routes (D5), guest id as player id (D4) and the socket as the room feed
  (D5) are assumptions about the unwritten server. Each is isolated in one
  module; the real check is `TASK-s1-compose-e2e`.
- Clock skew shifts the timer display (D6).
- Resent commands after a reconnect can show a rejection for an action that
  the server had already applied to a now-closed target; the idempotent
  session returns the original accepted result when the target is unchanged.
- Screenshots need a headless Chromium (Playwright) on the VM; none is
  installed now. Installed during Verify as a dev tool outside the repo.

## Team Lead decisions (2026-11-14, before Apply)

1. D4: approved. The server uses the lobby `guestId` as the core `playerId`;
   the client maps nicknames from `RoomSummary.members` (cache allowed) and
   falls back to the id. No new protocol field.
2. D5: the route table is canonical; server-api implements exactly these.
3. D5: approved. The room view opens the game socket with `Hello` in phase
   `lobby` and follows `Update` (`PlayerAdded`, `GameStarted`).
4. D10: approved. Root `build` becomes `pnpm -r run typecheck`.

Accepted risks: display-only clock skew of the timer; Node 22 is the target
(CI), newer local Node is fine for development.
