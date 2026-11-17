# Proposal

## Why

Stage 4 discards unpaid rent without eliminating its payer. Stage 5 must settle mandatory debt atomically through the accepted priority liquidation or bankruptcy, so play can reach a winner.

Sources: TASK-s5-core-debts revision 1; effort handoff revision 2; Team Lead design interpretations I1/I3/I4/I6; ROADMAP.md stage 5; GAME-BREAKDOWN.md sections “Ипотека и расчёт долгов”, “Банкротство”, and “Завершение игры и симуляция”. Base: mortgage merge 34d8c29 (PR #60).

## What Changes

- Route explicit rent and every mandatory turn settlement through one deterministic settleDebt function.
- Apply cash-only payment, an immediate insolvency check, then the three accepted liquidation tiers with per-step stopping and current-rent ordering.
- Sell houses without mortgage advances on bankruptcy, pay the available proceeds, release assets, cancel offers, eliminate the payer, and close their turn once.
- Reuse mortgage-era elimination, collective-lap, finish and result contracts; terminal bankruptcy skips lap processing.
- **BREAKING**: RentPaid contains payerId, ownerId, assetId, amount and auto; remove its interim paid/shortfall fields. Add public LiquidationApplied and PlayerBankrupt events, HouseSold auto, and bankrupt TurnEnded reason.

## Capabilities

### New Capabilities

- `engine/debt-settlement`: cash, tiered liquidation, insolvency payout and bankruptcy, with deterministic atomic execution and replay.

### Modified Capabilities

- `engine/rent-building`: replace interim mandatory payment; identify automatic house sales.
- `engine/turn-cycle`: bankruptcy overrides the closing reason and bonus, advances using old order, or ends the game.
- `engine/projection`: classify and publish debt settlement events for every viewer.

## Impact

Core rent, turn closure, house/mortgage mutation helpers, elimination helpers, event exports and projection; focused core tests and replay/restore tests. No new dependencies or rules version beyond core-7 introduced by PR #60.

Out of scope: protocol/server/client features, migrations, stage 6, trades, parked liquidation planner, changes to resignation or auction policy. Only mechanical build fixes outside core are authorized by the handoff. Existing client mock tests still assert removed RentPaid.paid; Team Lead must confirm permission for minimal assertion updates if required by pnpm test. UI payment animation migration belongs to TASK-s5-client.
