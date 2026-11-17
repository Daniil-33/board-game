# Tasks

## 1. Versioned state and mortgage commands

- [ ] 1.1 Add state types/genesis and core-7 gate (engine/mortgage: Mortgage state; engine/game-lifecycle: Genesis state and Rules version gate); update fixtures and verify initialization, old-version rejection and package typecheck.
- [ ] 1.2 Add mortgage.ts helpers/handlers, register/export them and extend money reasons (engine/mortgage: command validation, Taking a mortgage, Redemption, Shared pure helpers); verify all legality codes, payload/envelope/auction/actor/deadline precedence, unchanged rejected state/RNG, amounts/events, I1 and rent redemption rejection with unit tests and package typecheck.
- [ ] 1.3 Allow sale during own rent and wire isMortgaged (engine/rent-building: House sale legality, Logistics and energy rent, Landing settlement); verify sale/mortgage during rent, BuildHouse still RENT_PENDING/GROUP_MORTGAGED, fixed settlement amount and rent tables for regular doubling, logistics holdings, energy holdings and mortgaged zero quotes.

## 2. Terms, release and outcome

- [ ] 2.1 Integrate boundary processing in closeTurn (engine/mortgage: Collective lap processing, Elimination and expiry boundaries); verify two-/three-player laps, mid-lap mortgage, bonus/jail/sent-to-jail turns, exact eight-lap expiry, board event order and no balance debit on expiry.
- [ ] 2.2 Extend resignation with release, elimination records, cancelOffersOf and finishedAt/GameEnded (engine/resignation: Permanent elimination, Resignation releases assets, Last active player wins); verify unchanged balance/R1/R2, setup finish, unrelated resignation, immediate pending removal, deferred auction closure and terminal no-lap behavior.
- [ ] 2.3 Extend invariants and remove resigned-owner rent shortcut (engine/mortgage: Mortgage state; engine/resignation: Elimination and finish validity; engine/rent-building: State validity and replay); verify invalid terms/ownership/records/time fail and [1,1,0] expiry preserves houses/rent, rejects new builds and allows sales.

## 3. Public views and persistence proof

- [ ] 3.1 Extend exhaustive visibility maps and StateView terms/results (engine/projection: Public mortgages and results, Public mortgage and asset release events); verify all viewer roles, remainingLaps, null result outside finished, enriched terminal result, event ordering and detached JSON data.
- [ ] 3.2 Add seeded replay through mortgage, redeem, expiry and resignation plus mid-term snapshot restoration (engine/mortgage: Mortgage replay and restore; engine/resignation: Resignation replay and restoration); verify complete state/RNG/events/views/deadlines match live execution.

## 4. Integration and delivery

- [ ] 4.1 Compare final diff with all 13 handoff acceptance criteria, reconcile parallel index.ts exports and report every mechanical out-of-core type fix or seeded fixture repin; verify pnpm build, pnpm test, openspec validate --all --strict and git diff --check pass.
- [ ] 4.2 Commit/push assigned branch and open PR using agentctl operation intent/verification/confirmation; start independent review with agentctl review start, resolve supported findings and verify required CI jobs pass for the exact reviewed head.

## Workflow follow-up

- Submit this proposal to the Team Lead and start Apply only after approval in a fresh context.
- Archive this change in the PR after independent review passes; rerun required checks and obtain CI/review evidence for the resulting head.
- Report acceptance evidence/residual risks through agentctl and await Team Lead acceptance; do not merge the PR.
