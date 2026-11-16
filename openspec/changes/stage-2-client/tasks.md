# Tasks

## 1. Generated display data

- [x] 1.1 Update existing test helpers and dev MockGame to use core-generated boards and realistic balance views/events (Generated board; Public player balances); verify mock tests cover board presence, starting balances and lap balance updates.
- [x] 1.2 Add one pure cell display module for names, group markers and prices (Generated board); verify mapping tests for every cell kind and ten distinct groups using generated fixtures.

## 2. Board rendering and selection

- [x] 2.1 Update BoardCanvas to draw projected board labels, markers and prices and remove placeholders (Generated board); verify scene graph tests, retained token/elimination/animation tests and client typecheck.
- [x] 2.2 Add local board selection callback wiring through the existing adapter and GameScreen (Asset inspection); verify asset click delivers its cell index, special clicks do nothing and teardown removes the callback.

## 3. Vue display

- [x] 3.1 Add PlayerPanel and integrate it into GameScreen (Public player balances); verify component tests render every participant, refreshed nicknames, active/out markers and replacement-view balances without waiting for animation.
- [x] 3.2 Add AssetCard and integrate selection into GameScreen (Asset inspection); verify component tests for monopoly/logistics/energy content, other group members with cells/prices, close control, Escape, board replacement and unmount cleanup.
- [x] 3.3 Adjust existing client styles for legible board, panel and card layout (Generated board; Public player balances; Asset inspection); verify a manual mock session and capture a screenshot containing all three.

## 4. Integration verification

- [x] 4.1 Run pnpm build, pnpm test, client vite build, openspec validate --all --strict and git diff --check; compare final diff against all seven handoff criteria and record exact results.
- [ ] 4.2 Reconcile current main and the server protocol version dependency before PR; verify final branch scope is apps/client plus OpenSpec, rerun affected checks after rebase and record screenshot evidence in the task report.

## Workflow follow-up

- Commit and push agent/task-s2-client and open a PR using agentctl external-operation records.
- Obtain independent exact-head review and green CI, address supported findings, then archive the change in the PR and verify the resulting specs.
- Report evidence and residual risks to Team Lead for task acceptance; do not merge the PR as Engineer.
