# Tasks

## 1. Apply gates
- [ ] 1.1 Obtain Team Lead proposal approval and start Apply in a fresh context;
  reconcile delivered protocol exports/routes with server-api and record its
  source SHA. Do not edit packages/protocol.

## 2. Session and lobby
- [ ] 2.1 Extend api/lobby.ts with checked create details, optional code bodies,
  get and leave; extend api/routes.ts with fixed routes. Test malformed
  responses and error codes (session: Lobby, Room view, Creator access details).
- [ ] 2.2 Extend client.ts coordinator with scoped get-room refresh, invite
  consumption, creator secrets, leave/closure cleanup and recovered poll errors;
  extend main.ts dependency wiring. Test async lookup/poll races and login
  continuation (session: all added requirements).
- [ ] 2.3 Update LobbyScreen.vue code/create/join controls and room labels;
  test open/locked/in-play/full states and invalid-code retry (session: Lobby).
- [ ] 2.4 Update RoomScreen.vue with Leave and creator-only code/link/copy UI;
  test late nicknames, leave success/failure and clipboard fallback
  (session: Room view, Creator access details).

## 3. Connection and game presentation
- [ ] 3.1 Update net/connection.ts terminal errors and Resign revision-envelope
  path; test ROOM_CLOSED, replacement without retries/storage loss, null payload,
  stale rejection and ordinary drop/reconnect (connection: all requirements).
- [ ] 3.2 Update game/view.ts selectors for resignation and eliminated entries;
  test off-turn/expired-deadline availability and spectator action denial
  (game-screen: Turn order, Confirmed resignation).
- [ ] 3.3 Add one confirmation component and wire GameScreen/HUD; test cancel,
  confirm, duplicate pending, rejection and spectator projection updates
  (game-screen: Confirmed resignation and spectator).
- [ ] 3.4 Update TurnOrder.vue elimination markers and BoardCanvas.ts hidden
  tokens, with coordinator queue cancellation; test queued-animation elimination
  and survivor colors (game-screen: Turn order, Placeholder board).
- [ ] 3.5 Add one GameOverScreen.vue and wire App.vue finished routing; test
  winner names, setup finish, eliminated viewers and local return without Leave
  (game-screen: Game over).

## 4. Mock and proof
- [ ] 4.1 Extend mock/server.ts HTTP summaries/access/get/leave/close and socket
  replacement; test protocol-valid responses and creator closure for all members
  (session: Lobby, Room view, Creator access details; connection: Server errors).
- [ ] 4.2 Extend mock/game.ts scripted leave/resign/finished projections and
  timers; test setup/play spectator and winner scenarios, keeping network drop
  separate (game-screen: Confirmed resignation, Game over; connection: Disconnect).
- [ ] 4.3 Run pnpm install --frozen-lockfile, pnpm build, pnpm test,
  pnpm --filter @game/client exec vite build, and git diff --check over the range;
  run client typecheck after package changes. Inspect final acceptance diff.
- [ ] 4.4 Capture mock screenshots of open/locked/in-play lobby, invite join,
  leave/closure, resign/spectator and game over; record paths and test results
  with agentctl engineer report --wake.

## 5. Delivery
- [ ] 5.1 Rebase on current main; commit intended client/spec changes, record
  external-operation intent, push agent/task-s1-client-lobby over authorized
  HTTPS helper, verify and confirm; open PR via the same operation protocol.
- [ ] 5.2 Obtain green CI and independent exact-head review using the Engineer
  review handoff template; address supported findings, report residual risks,
  and request Team Lead acceptance. Do not merge the PR as Engineer.
- [ ] 5.3 After merge, sync/archive only under project/Team Lead ordering policy.
