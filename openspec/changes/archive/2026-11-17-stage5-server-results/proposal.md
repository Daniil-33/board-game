# Proposal

## Why

The merged core-7 supports mortgages, liquidation and bankruptcy, but the protocol still exposes stage 4 commands and the server does not store relational game results. TASK-s5-server revision 1 supplies the accepted server boundary for stage 5.

## What Changes

- **BREAKING**: protocol version 5 adds Mortgage and Redeem with the existing bounded asset payload validation.
- Migration 0006 closes active legacy rooms, retains their data, and creates game_results.
- Persist GameEnded results atomically with the command log, finished status and final snapshot before broadcast.
- Prove mortgage recovery and finished-room reconnects through real PostgreSQL and sockets.
- Extend guarded core-helper fixtures for expiry, all liquidation tiers, bankruptcy, terminal bankruptcy and restart.

Rules follow GAME-BREAKDOWN.md § "Ипотека и расчёт долгов", § "Банкротство" and § "Завершение игры и симуляция", as resolved by ROADMAP.md stage 5 and the accepted effort revision 2 and Team Lead design.

Out of scope: core rules, client UI, Playwright, deployments and new result semantics. Only type-forced client placeholders are permitted, and will be reported.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `protocol/frames`: protocol v5 mortgage commands and public core-7 projection.
- `server/persistence`: retirement migration and atomic relational results.
- `server/recovery`: exact core-7 mortgage recovery and finished-room reload.
- `server/test-fixtures`: core-7 fixture catalog through the existing guarded loader.

## Impact

Changes packages/protocol and apps/server, SQL migration 0006, tests and fixture documentation. No new dependencies or production endpoints. Work starts at fb625a1 on agent/task-s5-server; the Team Lead design is currently in the TL-stage-5-design worktree at docs/efforts/stage-5-mortgage-debts-bankruptcy/design.md. Team Lead approval and a fresh Apply context are required before implementation.
