# Tasks

## 1. Approval and baseline

- [ ] 1.1 Reconcile Team Lead approval, handoff revision and source design in a fresh Apply context; verify agentctl acknowledgement and clean agent/task-vd-fsd branch.
- [ ] 1.2 Build the pristine base bundle and record raw/gzip JS/CSS per-file totals and tool versions in /srv/agents/evidence/TASK-vd-fsd/; verify reproducible baseline before dependency changes.

## 2. Moves (client/structure — Enforced client boundaries)

- [ ] 2.1 Move shared/api (HTTP, runtime, socket and connection with structural input contracts) with its public index.ts and update affected imports; verify client typecheck and focused existing tests with unchanged assertions.
- [ ] 2.2 Move entities/game (store, view, animation, debts, house and mortgage adapters; Board contract) with its public index.ts and update affected imports; verify client typecheck and focused existing tests with unchanged assertions.
- [ ] 2.3 Move entities/session (session persistence) with its public index.ts and update affected imports; verify client typecheck and focused existing tests with unchanged assertions.
- [ ] 2.4 Move features/client-session (client coordinator and injection API) with its public index.ts and update affected imports; verify client typecheck and focused existing tests with unchanged assertions.
- [ ] 2.5 Move widgets/board (Pixi scene, geometry and display) with its public index.ts and update affected imports; verify client typecheck and focused existing tests with unchanged assertions.
- [ ] 2.6 Move widgets/players-panel (PlayerPanel) with its public index.ts and update affected imports; verify client typecheck and focused existing tests with unchanged assertions.
- [ ] 2.7 Move features/turn-actions (ActionButtons) with its public index.ts and update affected imports; verify client typecheck and focused existing tests with unchanged assertions.
- [ ] 2.8 Move features/resign (ResignControl) with its public index.ts and update affected imports; verify client typecheck and focused existing tests with unchanged assertions.
- [ ] 2.9 Move widgets/turn-header (Hud, TurnOrder and TurnTimer) with its public index.ts and update affected imports; verify client typecheck and focused existing tests with unchanged assertions.
- [ ] 2.10 Move widgets/asset-card (AssetCard) with its public index.ts and update affected imports; verify client typecheck and focused existing tests with unchanged assertions.
- [ ] 2.11 Move widgets/purchase-card (PurchaseDialog) with its public index.ts and update affected imports; verify client typecheck and focused existing tests with unchanged assertions.
- [ ] 2.12 Move widgets/auction-panel (AuctionPanel) with its public index.ts and update affected imports; verify client typecheck and focused existing tests with unchanged assertions.
- [ ] 2.13 Move widgets/rent-panel (RentPanel) with its public index.ts and update affected imports; verify client typecheck and focused existing tests with unchanged assertions.
- [ ] 2.14 Move widgets/debt-notices (DebtNotices) with its public index.ts and update affected imports; verify client typecheck and focused existing tests with unchanged assertions.
- [ ] 2.15 Move pages/login (LoginScreen) with its public index.ts and update affected imports; verify client typecheck and focused existing tests with unchanged assertions.
- [ ] 2.16 Move pages/lobby (LobbyScreen) with its public index.ts and update affected imports; verify client typecheck and focused existing tests with unchanged assertions.
- [ ] 2.17 Move pages/room (RoomScreen) with its public index.ts and update affected imports; verify client typecheck and focused existing tests with unchanged assertions.
- [ ] 2.18 Move pages/game (GameScreen) with its public index.ts and update affected imports; verify client typecheck and focused existing tests with unchanged assertions.
- [ ] 2.19 Move pages/game-over (GameOverScreen) with its public index.ts and update affected imports; verify client typecheck and focused existing tests with unchanged assertions.
- [ ] 2.20 Move app (entrypoint, App and global styles) with its public index.ts and update affected imports; verify client typecheck and focused existing tests with unchanged assertions.
- [ ] 2.21 Remove obsolete directories, update HTML entry and external board-layout import; verify client/mock tests and bundle build, then commit moves separately.

## 3. Boundaries (client/structure — Enforced client boundaries)

- [ ] 3.1 Add pinned eslint-plugin-boundaries dependency and client layer/public API configuration; verify upward, peer-slice, type-only and private-import negative probes fail while intra-slice imports pass.
- [ ] 3.2 Add client lint command to CI; verify the same command passes locally and includes Vue and TypeScript sources, then commit boundaries separately.

## 4. Localization (client/localization)

- [ ] 4.1 Add pinned vue-i18n 11 and shared/i18n provider with glob discovery, English default/fallback and JSON resources; verify discovery and English fallback tests (Discovered English locale).
- [ ] 4.2 Migrate client-owned template/TS/Pixi text and reason maps to unchanged English keys in shared/i18n; document semantic key naming and data exceptions in README, and verify all existing exact English assertions (Complete unchanged English keys).
- [ ] 4.3 Add shared/lib Intl formatting wrappers and migrate formatting calls; verify exact money/timer/timestamp fixtures and integer monetary behavior (Shared locale formatting).
- [ ] 4.4 Add pinned @intlify/eslint-plugin-vue-i18n and configure raw-text/missing-key rules; verify temporary violations fail and the clean tree passes (Complete unchanged English keys).
- [ ] 4.5 Add key-inventory parity unit test covering template, TypeScript and typed map references; verify unused and missing key probes fail (Complete unchanged English keys).
- [ ] 4.6 Add shared/sound public no-op playSound and never SoundId without callers; verify no audio/network/storage side effects (client/structure — Inert sound slot), then commit localization separately.

## 5. Test hooks (client/structure — Stable browser hooks)

- [ ] 5.1 Migrate data-test to data-testid, add hooks for remaining selected elements and update component selector helpers only; verify unchanged component assertions pass.
- [ ] 5.2 Update e2e selector helpers and remaining text/structure selectors to hooks, preserving behavior assertions; verify e2e typecheck and stage 1–5 production/seeded/fixture suites, then commit hooks separately.

## 6. Integration and delivery

- [ ] 6.1 Verify pnpm build, pnpm test, client build:bundle, client lint, browser typecheck and openspec validate --all --strict; save concrete command evidence.
- [ ] 6.2 Measure final gzip bundle with baseline method; verify aggregate JS/CSS growth at most 15,000 bytes and save per-file/totals evidence.
- [ ] 6.3 Inspect acceptance coverage and final diff, run git diff --check 75f8f9d HEAD; verify no server/protocol/core changes and no unintended text/style changes.
- [ ] 6.4 Record agentctl external-operation intents, push feature branch, create PR with before/after sizes and residual risks, verify external state and confirm operations; verify all CI jobs on exact PR head.
- [ ] 6.5 Start independent exact-range review using engineer-to-reviewer template, address supported findings and verify affected checks plus independent approval on final code head.

## Workflow follow-up

- Archive the OpenSpec change in the PR after review passes, as required by TASK-vd-fsd; validate archived specs and obtain CI/review evidence for the final head.
- Report evidence through agentctl engineer report --wake and request Team Lead acceptance; do not merge the PR.
