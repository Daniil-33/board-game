# Tasks

## 1. Deferred game loading

- [x] 1.1 Defer game-screen and game-only dependencies while preserving the session state machine; add browser coverage for login/lobby/room without Pixi, mid-load view updates, game entry, and direct game reload/reconnect per `client/session` and `client/game-screen`; focused Playwright coverage and the delayed-component unit case pass.
- [x] 1.2 Verify the built Vite manifest and login-to-game browser network log show no Pixi/game presentation on login, lobby, or room and show the game chunk only on game entry; existing browser coverage passes.

## 2. Logo assets and requests

- [x] 2.1 Optimize brand light/dark SVGs with safe SVGO settings where possible; record whole-set raw/gzip totals and per-file byte sizes; compare every changed file at 512x512 and 1024x1024 using max channel delta 16 for at most 0.5% of pixels and absolute max delta 64; save a side-by-side PNG for every passing change; list all >20,000-byte exceptions with raw/gzip sizes and reason in the visual-design effort summary.
- [x] 2.2 Keep logo URL resolution side-effect free and cover only-visible-logo requests; verify the logo manifest test and a browser network log show no login/lobby logo requests and only rendered game logos, per `client/logos`.

## 3. Bundle and staging evidence

- [x] 3.1 Record initial-route and lazy emitted JS per chunk against the merge base using Node zlib, the initial-route reduction, and total-JS budget; verify all emitted JS gzip is no more than 343,863 bytes and inspect the Vite manifest.
- [ ] 3.2 Record matched staging Lighthouse mobile LCP, TBT, available TTI, and transferred bytes for login and game before and after using the Playwright/Chromium container; verify raw reports and network logs are in `/srv/agents/evidence/TASK-vd-load-split/`.

## 4. Integration and delivery

- [x] 4.1 Run `pnpm build`, `pnpm test`, lint, `pnpm typecheck:e2e`, `openspec validate --all --strict`, and `git diff --check <base> HEAD`; record results and confirm all browser specs pass. Standard browser suite: 8 passed; isolated stage 4/5 fixtures: 18 passed across full run and corrected restart rerun; deterministic seed 6689 case: 1 passed. Evidence recorded in `/srv/agents/evidence/TASK-vd-load-split/verification.md`.
- [ ] 4.2 Open the feature-branch PR, confirm all four CI jobs pass on its head, start independent review, resolve supported findings, and record review evidence in `/srv/agents/evidence/TASK-vd-load-split/`.

## Workflow follow-up

- Archive the OpenSpec change in the PR after independent review passes.
- Verify the archived specs and final PR head before reporting completion.
