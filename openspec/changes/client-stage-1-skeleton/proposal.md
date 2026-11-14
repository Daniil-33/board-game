# Proposal

## Why

Stage 1 ("Сквозной скелет", ROADMAP.md § "Этап 1", block "Клиент") needs a
browser client: Vue screens for login and lobby, a HUD with turn order and
timer, and a PixiJS ring with tokens, dice and movement animation. The effort
handoff (`docs/efforts/stage-1-skeleton.md`, criteria 1, 8, 9, 11) and the
task handoff `TASK-s1-client` revision 1 fix the observable behavior.
GAME-BREAKDOWN.md § "Принятые технические границы и текущая реализация"
requires an authoritative server; the client therefore sends intents only and
renders the server's projection. GAME-BREAKDOWN.md § "Порядок ходов, ход и
кости" is the rule source for what the HUD shows (order roll, 45 s turn,
doubles); the client implements none of those rules.

`apps/client` is currently an empty stub (`export {}`).

## What Changes

- `apps/client` becomes a Vite + Vue 3 + PixiJS application
  (`@game/client`), depending on `@game/protocol` and on `@game/game-core`
  for types and pure constants only (`PLACEHOLDER_RING` and the two target
  kinds).
- Login screen: nickname -> guest login; `{ guestId, token, nickname }` kept
  in `localStorage`.
- Lobby screen: list joinable rooms, create, join; room view with members and
  a creator-only Start button enabled with at least two members. No
  leave-room control.
- Game screen: Vue HUD (turn order, active player, timer from the server
  deadline, RollForOrder / RollDice / EndTurn enabled from the view,
  rejected-`Ack` messages) over a PixiJS canvas (placeholder ring of 40
  cells, jail cell, tokens, dice and step-by-step movement driven by
  `Update.events`).
- Connection layer: every received frame goes through `decodeServerFrame`;
  reconnect with `Hello { lastRevision }`; unacknowledged commands are resent
  with their original `commandId`.
- Dev-only mock server (`apps/client/mock/`, not part of the bundle) that
  serves the lobby over HTTP and a scripted game over WebSocket.
- Tests (vitest + @vue/test-utils): timer from deadline, button enablement
  per view, reconnect flow, event-to-animation queue ordering; PixiJS smoke
  test.

## Capabilities

### New Capabilities

- `client/session`: guest login and token persistence, lobby and room view.
- `client/connection`: frame decoding, Hello/Welcome, commands and Ack,
  reconnect.
- `client/game-screen`: HUD state derived from the view, board rendering and
  the event animation queue.

## Impact

- `apps/client/**` (new sources, `index.html`, Vite and vitest config,
  mock server, tests).
- `pnpm-lock.yaml`: `vue`, `pixi.js`, `vite`, `@vitejs/plugin-vue`,
  `vue-tsc`, `@vue/test-utils`, `happy-dom`, `vite-node` and `ws` (mock only),
  `@sinclair/typebox` (lobby response checks).
- One line in the root `package.json`: `build` becomes
  `pnpm -r run typecheck` so `.vue` files are typechecked (design D10,
  approved by the Team Lead). Nothing else outside `apps/client/**` and the
  lockfile.
- No change to `packages/game-core`, `packages/protocol`, `apps/server`.

## Out of Scope

- Server code, Fastify routes, Docker, Postgres (server and compose tasks).
- Playwright end-to-end scenarios against the real server
  (`TASK-s1-compose-e2e`).
- Money, assets, purchase, auction, rent, building, trades UI (stage 2+).
- Leave-room, accounts, spectators.
- Any game rule: the client never computes dice, movement, order, jail or
  deadlines; it never sends `actor`.
- New protocol fields. Where the view lacks data (player nicknames, server
  time), this change uses what the lobby schemas already carry and records
  the gap in the design (D4, D6) for the Team Lead.
- Visual design beyond a clean usable layout; the final board look arrives
  with the real `CLASSIC_40` layout in stage 2.
