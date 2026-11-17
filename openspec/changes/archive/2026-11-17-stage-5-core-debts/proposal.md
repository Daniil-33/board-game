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

Out of scope: protocol/server/client features, migrations, stage 6, trades, parked liquidation planner, changes to resignation or auction policy.

Team Lead scope extensions authorize only compatibility updates outside core:
- apps/client/src/game/animation.ts reads successful RentPaid.amount with existing guards.
- apps/client/src/__tests__/stage4.test.ts and apps/client/mock/__tests__/stage4.test.ts use the current payment payload.
- e2e/stage4.spec.ts uses current RentPaid/HouseSold payloads and replaces the interim partial-payment assertion with bankruptcy through projected events/state only.
- packages/protocol/src/__tests__/stage4.test.ts uses the current RentPaid fixture.

No server fixture builder or stage 5 client UI changes are included.
