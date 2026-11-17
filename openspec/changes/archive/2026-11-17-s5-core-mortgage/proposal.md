# Proposal

## Why

Stage 4 has mortgage hooks but no mortgage lifecycle. Stage 5 needs deterministic mortgage terms and asset release before debt liquidation can be integrated.

## What Changes

- **BREAKING**: run only `core-7`, adding mortgages, elimination records and finish time to state and enriching GameEnded.
- Add Mortgage/Redeem, pure display legality helpers, and per-mortgage eight-collective-lap expiry at turn boundaries.
- Permit mortgage and house sale during the payer's own rent; retain interim shortfall settlement until core-debts.
- Release resigned players' assets, preserve R1/R2, and expose public mortgages and results.
- Preserve sibling houses after expiry of a zero-house asset; relax whole-group house ownership validity as approved by the Team Lead on 2026-11-17.

## Capabilities

### New Capabilities

- `engine/mortgage`: mortgage commands, persisted terms, collective laps and expiry.

### Modified Capabilities

- `engine/rent-building`: real mortgage hooks, sale during rent, active house ownership and expiry survival.
- `engine/resignation`: asset release, elimination details and finished results.
- `engine/projection`: public mortgage terms, elimination records, results and events.
- `engine/game-lifecycle`: genesis additions, core-7 gate and complete playing command list.

## Impact

Core state, registry, rent, houses, turn closure, resignation, invariants, projection, exports and tests. No dependencies added. Mechanical type repairs outside core only if build requires them, each reported.

Sources: task TASK-s5-core-mortgage revision 1; effort handoff revision 1 (docs PR #57 head 585d81b); TL design (docs PR #58); TL response on I1 expiry; ROADMAP stage 5; GAME-BREAKDOWN.md headings «Ипотека и расчёт долгов», «Банкротство», «Завершение игры и симуляция».

Out of scope: liquidation search and debt/bankruptcy wiring, protocol/server/client features, migrations, trades and final jail rules. The accepted stage-4 interim shortfall behavior stays deployable. Implementation starts only after proposal approval in a fresh Apply context.
