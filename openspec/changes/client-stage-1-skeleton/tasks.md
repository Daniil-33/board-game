# Tasks

All paths are under `apps/client`. After each group: `pnpm build` and
`pnpm --filter @game/client test` pass.

## 1. Scaffold (design D1, D10)

- [x] 1.1 `package.json` (deps `vue`, `pixi.js`, `@game/protocol`,
  `@game/game-core`; dev deps `vite` 5, `@vitejs/plugin-vue` 5, `vue-tsc`,
  `@vue/test-utils`, `happy-dom`, `ws`, `vite-node`), scripts `dev`, `mock`,
  `build:bundle`, `typecheck`, `test`; `index.html`, `vite.config.ts` (proxy
  `/api`, `/ws`), `vitest.config.ts`, `tsconfig.json`; update
  `pnpm-lock.yaml`. Apply the typecheck wiring the Team Lead chose in D10.
  Verify: `pnpm install --frozen-lockfile`, `pnpm build`, `vite build`
  emits `dist/`.
- [x] 1.2 Not needed: core-turns (PR #7) merged before Apply, so the real
  game-core types are imported and no stub file exists (design D2).

## 2. Session and lobby (spec: client/session)

- [x] 2.1 `src/store/session.ts`: guest and room persistence in
  `localStorage`, member cache, nickname lookup (design D4; "Identity
  survives a reload"). Verify: vitest with a fake storage for store, reload
  and clear.
- [x] 2.2 `src/api/routes.ts`, `src/api/lobby.ts`: fetch wrappers with bearer
  header and schema-checked responses (design D5; "Lobby"). Verify: vitest
  with a fake `fetch` for success, lobby error body and malformed response.
- [x] 2.3 `LoginScreen.vue` ("Guest login"). Verify: component test for
  trimmed nickname sent, invalid nickname not sent, error shown.
- [x] 2.4 `LobbyScreen.vue`, `RoomScreen.vue` ("Lobby", "Room view"). Verify:
  component tests for create, join, Start hidden for non-creator, disabled
  with one member, enabled with two; no leave control in the DOM.

## 3. Connection (spec: client/connection)

- [x] 3.1 `src/net/socket.ts`, `src/net/connection.ts`: Hello/Welcome,
  decoding, Update revision rule ("Frames go through the protocol",
  "Handshake", "Updates"). Verify: vitest with a fake socket for first
  connect, malformed message, stale update.
- [x] 3.2 Commands, outbox and Ack ("Intents only", "Acknowledgements").
  Verify: sent frames pass `decodeClientFrame`, have no `actor`, carry the
  right target; rejected Ack reaches the message list.
- [x] 3.3 Reconnect with backoff, outbox resend, Error frame handling
  ("Reconnect", "Server errors"). Verify: fake timers; scenarios socket drop
  mid-turn, pending command survives a drop with the same `commandId`,
  acknowledged command not resent, each Error code.

## 4. HUD (spec: client/game-screen)

- [x] 4.1 `src/game/view.ts` selectors (design D6, D7). Verify: table tests
  for every "Action buttons follow the view" scenario, `turnOrder` in setup
  and playing, `remainingMs` bounds.
- [x] 4.2 `TurnTimer.vue` ("Timer from the server deadline"). Verify:
  component test with an injected clock for mid-turn reconnect (13 s),
  continuation (20 s), past deadline (0 s).
- [x] 4.3 `TurnOrder.vue`, `ActionButtons.vue`, `Hud.vue` ("Turn order and
  active player", rejected-Ack messages). Verify: component tests for
  ordering, active mark, tied mark, jail badge, disabled attributes per view,
  message rendering.

## 5. Board and animation (spec: client/game-screen)

- [x] 5.1 `src/game/animation.ts` (design D8; "Animation follows events in
  order"). Verify: vitest with a recording `play` fake for roll then move
  (cells 39, 0, 1..5), two updates FIFO, third double, unknown event,
  Welcome clears the queue.
- [x] 5.2 `src/board/layout.ts`: 40 distinct cell rectangles on a square
  ring (design D9). Verify: vitest for count, no overlap, corner indices 0,
  10, 20, 30.
- [x] 5.3 `src/board/BoardCanvas.ts`: ring, start and jail markers,
  placeholder caption, tokens, dice, step player (design D9; "Placeholder
  board"). Verify: smoke test for 40 cells, caption text, one token per
  player.
- [x] 5.4 `GameScreen.vue` and `App.vue` screen selection (design D1).
  Verify: component test that phase `lobby` shows the room view and `setup`
  the game screen.

## 6. Mock server (design D11; handoff criterion 7)

- [x] 6.1 `mock/script.ts`, `mock/game.ts`, `mock/server.ts`, `mock/main.ts`. Verify: a vitest that
  drives the mock's frame handler through the script and decodes every
  emitted frame with `decodeServerFrame`; manual run `pnpm --filter
  @game/client mock` plus `dev` reaches every screen.

## 7. Verify

- [x] 7.1 Run `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm test`,
  `vite build`, `git diff --check`; confirm the mock and `ws` are absent
  from `dist/`.
- [x] 7.2 Capture screenshots of login, lobby, room and several turns
  (including a reconnect) against the mock with headless Chromium.

## 8. Before the PR

- [x] 8.1 Rebased on `main` with core-turns (PR #7) merged; types,
  `PLACEHOLDER_RING` and the target kinds come from `@game/game-core`;
  `boundary.test.ts` fails on any other game-core value import. Verify: full
  check list of 7.1 again.
