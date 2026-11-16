# Tasks

## 1. Static board data

- [x] 1.1 Add board/classic40.ts and layout tests for engine/board «Classic layout»: exact indices/kinds/ranks, counts, freezing and fixed geometry; verify focused vitest and package typecheck.
- [x] 1.2 Add catalog/ua-1.json for engine/board «Versioned catalog», preserving all names and order; verify an independent proposal-name fixture, category/company counts and global id uniqueness.
- [x] 1.3 Add catalog.ts validation for engine/board «Versioned catalog»; verify valid data and malformed catalog tests plus package typecheck.
- [x] 1.4 Add board/prices.ts for engine/board «Fixed price table»; verify every literal, last-by-index rule and S=56740 in data tests.

## 2. Generated board and lifecycle

- [x] 2.1 Add board/generate.ts with GeneratedBoard/BoardCell/BoardAsset and pure gen-1 for engine/board «Deterministic generation»; verify fixed seed/entropy golden board and RNG, input immutability, changed seed/entropy examples and deterministic many-seed shape/coverage tests.
- [x] 2.2 Extend state.ts and genesis for engine/game-lifecycle «Genesis state» and engine/board «Board shape invariant»; verify genesis fields and JSON serialization tests.
- [x] 2.3 Integrate creation entropy absorption, board generation and events in lifecycle.ts for engine/game-lifecycle «Create game» and «Rules version gate»; export the required contracts and bump to core-4; verify event metadata/order, old-version rejection and no state/RNG changes on rejection.
- [x] 2.4 Extend invariants.ts for engine/board «Board shape invariant»; verify malformed kinds/indices/assets/prices/groups/categories and duplicate ids raise board-shape, and all generator samples pass.

## 3. Economy and movement

- [x] 3.1 Extend money.ts for engine/economy «Starting capital and fixed economy» and «Every balance change emits an event»; verify all five C/reward pairs, exact integer quanta, immutable credit results and prototype-like player ids.
- [x] 3.2 Integrate StartGame economy and join-order credits for engine/game-lifecycle «Start game»; verify two through six players, pre-start departure, event order and unchanged rejected starts.
- [x] 3.3 Extend invariants.ts for engine/economy «Balance invariant»; verify negative/fractional/unsafe/non-quantized balances, missing/extra keys and wrong economy presence raise balances; verify eliminated entries are retained.
- [x] 3.4 Replace temporary board definitions and movement facade with CLASSIC_40 and ordered movement events for engine/turn-cycle «Movement on CLASSIC_40»; verify from 39/35/30 and boundary positions with every steps value 2..12, exact zero landing and no crossing.
- [x] 3.5 Update turns.ts consumers and jail references for engine/economy «Forward crossing reward»; verify manual/automatic rewards occur immediately after PlayerMoved, third doubles pay nothing, interim releases from 10 pay nothing, and all landing kinds remain inert.
- [x] 3.6 Verify resignation in setup/playing/finished preserves balances and emits no money changes for engine/economy «Balance invariant»; extend existing resignation tests alongside any necessary fixture updates.

## 4. Public contracts and regression proof

- [x] 4.1 Update projection.ts visibility/event union and exports for engine/projection «State projection hides secrets» and «Event projection fails closed»; verify all viewer classes receive detached board/economy/balances and public events, with no RNG leakage.
- [x] 4.2 Replace remaining game-core placeholder references and update fixtures, event assertions and core-4 goldens for engine/board «Classic layout» and lifecycle deltas; verify no placeholder marker remains in game-core and existing unit tests pass without weakening assertions.
- [x] 4.3 Update session replay/golden/property and restore tests for engine/board «Deterministic generation» and engine/economy «Forward crossing reward»; explicitly compare board/balances/events from genesis and a mid-game JSON snapshot through a crossing and verify rejected inputs preserve RNG.
- [x] 4.4 Mechanically replace client imports of the removed export and adjust required typed fixtures only, per engine/board «Classic layout»; verify client boundary/layout/board tests and monorepo build, and enumerate every outside-core edit in the report.

## 5. Integrated acceptance

- [x] 5.1 Compare the complete diff against TASK-s2-core revision 1 criteria 1–13 and the Team Lead state/event/gen-1 contracts; record a criterion-to-test evidence map and any residual limitation.
- [x] 5.2 Run pnpm build, pnpm test, openspec validate --all --strict and git diff --check; record exact commands/results and current head in agentctl.

## Workflow follow-up

- Submit this proposal checkpoint to the Team Lead with agentctl engineer report --wake; await approval and a fresh Apply session before product-code edits.
- Reconcile branch and main before delivery; record external-operation intent, perform push and PR once, verify external state and confirm through agentctl.
- Request independent review for the exact commit range; resolve supported findings and require green CI on the final PR head.
- Archive/sync the OpenSpec change in the PR after review passes, rerun validation and required checks for the resulting head, and obtain Team Lead acceptance.
