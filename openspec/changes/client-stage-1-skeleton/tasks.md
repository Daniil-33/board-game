# Tasks

All paths are under `apps/client`. After each group: `pnpm build` and
`pnpm --filter @game/client test` pass.

## 1. Scaffold (design D1, D10)

- [ ] 1.1 `package.json` (deps `vue`, `pixi.js`, `@game/protocol`,
  `@game/game-core`; dev deps `vite` 5, `@vitejs/plugin-vue` 5, `vue-tsc`,
  `@vue/test-utils`, `happy-dom`, `ws`, `vite-node`), scripts `dev`, `mock`,
  `build:bundle`, `typecheck`, `test`; `index.html`, `vite.config.ts` (proxy
  `/api`, `/ws`), `vitest.config.ts`, `tsconfig.json`; update
  `pnpm-lock.yaml`. Apply the typecheck wiring the Team Lead chose in D10.
  Verify: `pnpm install --frozen-lockfile`, `pnpm build`, `vite build`
  emits `dist/`.
- [ ] 1.2 `src/game/core-types.ts` stubs (design D2). Verify: `tsc` passes;
  file header names PR #7 and the removal step 8.1.

## 2. Session and lobby (spec: client/session)

- [ ] 2.1 `src/store/session.ts`: guest and room persistence in
  `localStorage`, member cache, nickname lookup (design D4; "Identity
  survives a reload"). Verify: vitest with a fake storage for store, reload
  and clear.
- [ ] 2.2 `src/api/routes.ts`, `src/api/lobby.ts`: fetch wrappers with bearer
  header and schema-checked responses (design D5; "Lobby"). Verify: vitest
  with a fake `fetch` for success, lobby error body and malformed response.
- [ ] 2.3 `LoginScreen.vue` ("Guest login"). Verify: component test for
  trimmed nickname sent, invalid nickname not sent, error shown.
- [ ] 2.4 `LobbyScreen.vue`, `RoomScreen.vue` ("Lobby", "Room view"). Verify:
  component tests for create, join, Start hidden for non-creator, disabled
  with one member, enabled with two; no leave control in the DOM.

## 3. Connection (spec: client/connection)

- [ ] 3.1 `src/net/socket.ts`, `src/net/connection.ts`: Hello/Welcome,
  decoding, Update revision rule ("Frames go through the protocol",
  "Handshake", "Updates"). Verify: vitest with a fake socket for first
  connect, malformed message, stale update.
- [ ] 3.2 Commands, outbox and Ack ("Intents only", "Acknowledgements").
  Verify: sent frames pass `decodeClientFrame`, have no `actor`, carry the
  right target; rejected Ack reaches the message list.
- [ ] 3.3 Reconnect with backoff, outbox resend, Error frame handling
  ("Reconnect", "Server errors"). Verify: fake timers; scenarios socket drop
  mid-turn, pending command survives a drop with the same `commandId`,
  acknowledged command not resent, each Error code.

## 4. HUD (spec: client/game-screen)

- [ ] 4.1 `src/game/view.ts` selectors (design D6, D7). Verify: table tests
  for every "Action buttons follow the view" scenario, `turnOrder` in setup
  and playing, `remainingMs` bounds.
- [ ] 4.2 `TurnTimer.vue` ("Timer from the server deadline"). Verify:
  component test with an injected clock for mid-turn reconnect (13 s),
  continuation (20 s), past deadline (0 s).
- [ ] 4.3 `TurnOrder.vue`, `ActionButtons.vue`, `Hud.vue` ("Turn order and
  active player", rejected-Ack messages). Verify: component tests for
  ordering, active mark, tied mark, jail badge, disabled attributes per view,
  message rendering.

## 5. Board and animation (spec: client/game-screen)

- [ ] 5.1 `src/game/animation.ts` (design D8; "Animation follows events in
  order"). Verify: vitest with a recording `play` fake for roll then move
  (cells 39, 0, 1..5), two updates FIFO, third double, unknown event,
  Welcome clears the queue.
- [ ] 5.2 `src/board/layout.ts`: 40 distinct cell rectangles on a square
  ring (design D9). Verify: vitest for count, no overlap, corner indices 0,
  10, 20, 30.
- [ ] 5.3 `src/board/BoardCanvas.ts`: ring, start and jail markers,
  placeholder caption, tokens, dice, step player (design D9; "Placeholder
  board"). Verify: smoke test for 40 cells, caption text, one token per
  player.
- [ ] 5.4 `GameScreen.vue` and `App.vue` screen selection (design D1).
  Verify: component test that phase `lobby` shows the room view and `setup`
  the game screen.

## 6. Mock server (design D11; handoff criterion 7)

- [ ] 6.1 `mock/script.ts` and `mock/server.ts`. Verify: a vitest that
  drives the mock's frame handler through the script and decodes every
  emitted frame with `decodeServerFrame`; manual run `pnpm --filter
  @game/client mock` plus `dev` reaches every screen.

## 7. Verify

- [ ] 7.1 Run `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm test`,
  `vite build`, `git diff --check`; confirm the mock and `ws` are absent
  from `dist/`.
- [ ] 7.2 Capture screenshots of login, lobby, room and several turns
  (including a reconnect) against the mock with headless Chromium.

## 8. Before the PR

- [ ] 8.1 Rebase on `main` once core-turns (PR #7) is merged; delete
  `src/game/core-types.ts`, import types and `PLACEHOLDER_RING` from
  `@game/game-core`; add the test that no other game-core value is imported.
  Verify: full check list of 7.1 again.
