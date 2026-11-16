# Tasks

## 1. Contracts and rent calculations

- [x] 1.1 Add houses/rent state and RentSettlement, initialize genesis, bump sole supported version to core-6 and mechanically repair required fixtures (engine/rent-building: State validity and replay); verify core typecheck and version rejection tests; report every outside-core fixture repair.
- [x] 1.2 Add rent.ts pure mortgage hook, rentFor and energyRentFor (Regular rent; Logistics and energy rent); verify tables for every prices-1 price, regular houses 0..4/full and incomplete groups, logistics holdings 1..4, energy holdings 1..2 and dice sums 2..12, plus zero/resigned cases. Export helpers and types.

## 2. Settlement and closure

- [x] 2.1 Add landing and settlement operations and PayRent handler in rent.ts, register command and event types, extend balance reason contracts (Landing settlement; Mandatory payment); verify command payload/actor/target/deadline/no-rent rejections, fixed amount, full payment, zero balance and shortfall events with no mutation/RNG use on rejection.
- [x] 2.2 Wire actual movement including jail release and mandatory closeTurn settlement (Landing settlement; Mandatory payment); verify own asset, resigned owner, zero rent, failed jail attempt, release landing, purchase/auction exclusion, EndTurn and Timeout payment and unchanged deadline contract.
- [x] 2.3 Add isolated resignDuringRent before closure and terminal branches (Provisional rent resignation); verify payer, owner and unrelated resignation with two and three participants, balances unchanged under R1/R2 and no terminal rent.

## 3. Houses and quota

- [x] 3.1 Add houses.ts with exported buildLegality/saleLegality and BuildHouse/SellHouse handlers using those helpers (Building legality; House sale legality); verify every condition code, payload and guard rejection, debit/refund and event contents, 2- and 3-asset evenness, cap, funds and unlimited sales without restoring quota.
- [x] 3.2 Preserve remaining builds across bonus turns while resetting offers, reset builds on full turn starts (engine/turn-cycle: Turn quotas; Doubles grant a bonus turn); verify used and unused quota across consecutive doubles, timeout, auction closure, new full turn and continuation.

## 4. Projection and invariants

- [x] 4.1 Extend projection with public houses/rent and derived rentQuotes plus event visibility (engine/projection: Public rent and houses; Rent and house events are public); verify player/spectator/eliminated equality, detached data, energy helper agreement, fixed zero quotes and event order.
- [x] 4.2 Extend existing invariants for houses, groups, rent and quotas (engine/rent-building: State validity and replay); verify each invalid shape is rejected and accepted rent/build/sell sequences satisfy invariants.

## 5. Integration and delivery

- [x] 5.1 Add deterministic rent/build/sell replay and snapshot restoration with open rent (State validity and replay); verify complete state/events/RNG and pendingDeadlines equal live execution.
- [x] 5.2 Run pnpm build, pnpm test, openspec validate --all --strict and git diff --check; inspect diff against all 16 handoff criteria; check shared seeded Compose scenario and re-pin test data only if necessary with explicit evidence.
- [ ] 5.3 Rebase current main, commit and publish branch/PR through agentctl operation protocol, start independent review with agentctl review start and resolve findings; verify all CI jobs and review apply to the exact PR head and report evidence to Team Lead. Check ROADMAP R merge gate explicitly.

## Workflow follow-up

- Team Lead accepts this proposal and starts Apply in a fresh Engineer context before product code changes.
- Archive the OpenSpec change in the PR after independent review passes; verify resulting specs and CI for the final head. Engineer does not merge.

Archive checkpoint: REV-s4-core-1 PASS on 5a485aa. TL authorized archive after RVW-001 deadline-precedence fix; RVW-002 deferred to the stage 5 test plan. Task 5.3 remains open for final-head CI and REV-s4-core-2. Runtime evidence is recorded through agentctl. ROADMAP R remains a merge gate.
