# Tasks

## 1. Shared mutations and events

- [ ] 1.1 Extract the automatic-capable single mortgage effect in mortgage.ts (debt-settlement: Liquidation events and payment); verify manual mortgage regressions and identical quantized advances and pending initialization.
- [ ] 1.2 Extract the automatic-capable single house sale effect and add HouseSold.auto in houses.ts (rent-building: House sale legality); verify manual false, automatic true, refund rounding and evenness tests.
- [ ] 1.3 Factor shared portfolio release and elimination effects in resignation.ts if required (debt-settlement: Bankruptcy payout and release; Bankruptcy elimination and outcome); verify resignation regression tests, board-order release and empty-portfolio event suppression.

## 2. Atomic debt engine

- [ ] 2.1 Add debt.ts cash selection and liquidation with table tests (debt-settlement: Debt case selection; Complete groups and current asset order; Bare asset tiers; Built asset tier; Liquidation events and payment); prove each tier alone, stops inside every tier, covering bare sale without mortgage, tier 1→2 and 2→3 boundaries, price/id ties, live logistics repricing, energy at 7, group order and partial built groups.
- [ ] 2.2 Implement bankruptcy in debt.ts with tests (debt-settlement: Bankruptcy payout and release; Bankruptcy elimination and outcome); prove equal full value liquidates, debt 10 above full value bankrupts, no mortgage advances, legal sale events, exact payout/write-off, offer hook, portfolio release and elimination cleanup.

## 3. Rent and turn integration

- [ ] 3.1 Route rent.ts PayRent and automatic rent settlement through settleDebt, passing trusted time and preserving guard precedence (rent-building: Mandatory payment); replace obsolete core paid/shortfall assertions and verify full-payment payloads, fixed landing amount and rejected-command purity.
- [ ] 3.2 Factor post-settlement scheduling in turns.ts and integrate explicit bankruptcy (turn-cycle: Ending a turn; debt-settlement: Bankruptcy elimination and outcome); test PayRent, EndTurn and Timeout, exactly one closure/revision, pending bonus cancellation, old-order successor, mortgage pending removal and one nonterminal boundary.
- [ ] 3.3 Reuse enriched finish result for bankruptcy (debt-settlement: Bankruptcy elimination and outcome); test second-to-last bankruptcy, winner/time/all balances, no lap or TurnStarted, no deadlines, and rejection of subsequent actions.
- [ ] 3.4 Export debt contracts and classify events in projection.ts/index.ts (projection: Public debt settlement events); test identical ordered detached payloads for payer, creditor, eliminated participant and spectator.

## 4. Replay and delivery validation

- [ ] 4.1 Add a golden or property replay through liquidation, bankruptcy and finish (debt-settlement: Debt atomicity and replay); compare full states/events/RNG and restore snapshots after bankruptcy and finish, plus earlier snapshots with debt tails.
- [ ] 4.2 After Team Lead scope confirmation, make only authorized mechanical out-of-core fixes required by changed event contracts; enumerate every changed file and verify its focused tests without implementing server/client features.
- [ ] 4.3 Run pnpm build, pnpm test, openspec validate --all --strict and git diff --check; inspect the final diff against all handoff acceptance criteria and report concrete results and residual risks through agentctl.

## Workflow follow-up

- Obtain Team Lead proposal approval and start Apply in a fresh Engineer context before product code edits.
- Commit and push agent/task-s5-core-debts using recorded external-operation intent/verification; open the PR and start independent review with agentctl review start.
- Resolve findings, verify all CI jobs on the exact PR head, and archive this change in the PR once independent review passes, as required by the task handoff.
- Team Lead acceptance and merge complete the task; the Engineer does not merge.
