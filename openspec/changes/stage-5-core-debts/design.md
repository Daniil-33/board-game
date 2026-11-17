# Design

## Context

See proposal.md for motivation and sources. At base 34d8c29 rent.ts implements interim min(balance, rent) settlement; turns.ts calls it from closeTurn. Mortgage mutation and house sale mutations live inside handlers. resignation.ts already implements release, elimination and enriched victory; projection.ts requires an explicit event union and visibility classification. No product code changes occur in this proposal phase.

## Goals / Non-Goals

**Goals:** Implement the accepted debt tiers and bankruptcy using existing quantized helpers; preserve one command revision and exactly one turn closure. Keep selectors pure and deterministic.

**Non-Goals:** No search planner, new commands, persistent debt state, RNG draws, new version bump, auction policy changes, or infrastructure dependencies. Stage 6 bank creditors are a future caller, not new gameplay in this task.

## Decisions

1. **One debt engine with explicit outcome.** Add debt.ts with settleDebt(state, {payerId, creditorId, amount, cause}, now), returning state, events and whether bankruptcy occurred. The current cause is rent with its asset id and auto flag. It owns transfers, liquidation and bankruptcy mutations, but leaves turn scheduling to turns.ts. Keeping scheduling outside avoids recursive closeTurn calls when settleMandatory invokes debt settlement. Duplicating the cases in explicit and automatic payment was rejected because event order and insolvency would drift.

2. **Separate mandatory settlement from post-settlement scheduling.** Keep closeTurn as the mandatory-payment entry. Factor its post-settlement phase into a helper that accepts the old turn/order and outcome. closeTurn captures those before settlement; on bankruptcy it selects reason bankrupt and successor from old order, ignores pendingBonus and closes once. PayRent calls the same scheduling helper only if its settleDebt result is bankrupt; successful PayRent keeps its turn open. Terminal bankruptcy emits TurnEnded then GameEnded and clears gameplay targets without processMortgageBoundary. Nonterminal bankruptcy runs that boundary once using the survivors and then starts a regular turn. Resignation continues its established path and rent participant cancellation rules. Never call closeTurn again on an already settled bankruptcy.

3. **Step selection uses live state.** Index board assets, determine wholly owned groups including mortgaged holdings, and select bare candidates by (rentFor(state,id,7), price, id) in tiers 1 then 2. Sort identifiers with explicit lexical comparisons, avoiding locale-dependent ordering. Tier 3 selects groups by built-only rent/price sums and groupId, then retains that group until no houses remain. Each sale uses maximum house count then the current asset key. Recompute candidates and rents after every mutation; check coverage after each sale before any immediate mortgage. A simulation/search or stale pre-sorted list would violate the accepted priority rule.

4. **Reuse monetary mutations, not command dispatch.** Factor pure mortgage creation and one-house sale effects from their existing modules for manual and automatic callers, carrying auto explicitly. Command guards remain unchanged; automation does not consume manual quotas or reenter the registry. Reuse mortgageAdvance, houseCost, houseRefund, debitBalance and creditBalance. Each step retains the existing BalanceChanged-before-domain-event convention. Record ordered steps for LiquidationApplied after all raising events and before payment.

5. **Bankruptcy sells houses, never mortgages.** Compute full liquidation value before any mutation, counting advances for every non-mortgaged owned asset including built assets. When insolvent, repeatedly sell legal maximum-house assets (deterministic group and asset ties), transfer min(debt,cash after sales), release all assets in board order and emit PlayerBankrupt. Extract shared release/elimination effects in resignation.ts if needed so both paths retain cancelOffersOf, removeMortgageParticipant, ordered elimination records and no eliminated ownership. No LiquidationApplied or RentPaid is emitted for bankruptcy; PlayerBankrupt owns its paid/writtenOff payload. The scheduling helper handles victory using the existing GameEnded shape.

6. **Contract and invariant coverage.** Export debt event types, extend CoreEvent and visibility, add HouseSold.auto, remove RentPaid.paid/shortfall, and extend TurnEndReason. Existing no-eliminated-owner, house evenness, mortgage pending and finishedAt invariants remain authoritative. Replace obsolete core shortfall tests; retain historical archived specs. Test actual command execution in addition to selector tables.

## Risks / Trade-offs

- [Nested or repeated closure] → use an explicit settlement outcome and a post-settlement scheduler shared by PayRent and closeTurn; assert one TurnEnded/revision and no bonus after bankruptcy.
- [Partial house groups after expiry] → include all built payer groups in tier 3 and enforce even sales with unowned siblings counted as zero.
- [Fresh mortgages age on the paying turn] → initialize pending with the pre-elimination active order, then use the ordinary boundary once on successful or nonterminal debt closure; successful PayRent alone is not a boundary.
- [Out-of-core tests depend on removed fields] → two client mock assertions currently match RentPaid.paid. Request Team Lead authorization for mechanical assertion updates to amount; no UI feature work is proposed. Literal historical shortfall scenarios outside core belong to later stage 5 integration tasks.
- [Existing UI animation reads paid] → report to TASK-s5-client; changing client behavior exceeds this task. Protocol uses generic event envelopes, so runtime integration must be verified in downstream work.

## Migration Plan

Continue from core-7 base 34d8c29. After Team Lead approves, start Apply in a fresh Engineer context. Implement and verify the bounded core change, open a branch PR, obtain independent exact-head review and all green CI jobs, then archive the change in that PR after review passes. Stored-game migration remains the server task's responsibility. Rollback uses a reverting PR; never rewrite shared history.
