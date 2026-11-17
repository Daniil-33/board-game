# Team Lead -> Engineer Task Handoff

```yaml
id: TASK-s4-core
revision: 1
effort: EFF-stage-4-rent-building
project: economic-board-game
source_commit: 6a60bdc # main; effort handoff in docs PR #49
owner: team-lead
status: proposed
```

## Outcome

`packages/game-core` runs stage 4 rules under `core-6`:
- rent for regular, logistics and energy assets;
- the mandatory rent settlement of the turn, with the interim shortfall;
- building and selling houses with evenness and one house per full turn;
- mortgage hooks for stage 5;
- public projection of houses, rent quotes and the settlement.

## Acceptance criteria

Product (effort handoff C1-C9, C12, interim rules; formulas exactly as in
the design):

1. Regular rent: `Q(5%·price)`; doubled as `2 × Q(5%·price)` on a wholly
   owned group (mortgaged assets count toward the group); with 1/2/3/4
   houses `Q(15/35/65/100%·price)`.
2. Logistics rent: `Q(5/10/20/40%·price of the landed asset)` for 1/2/3/4
   non-mortgaged holdings.
3. Energy rent: `Q(sumPrices × diceSum × h / (200 × groupSize))`, where
   `diceSum` is the dice sum of the landing move.
4. Mortgage hooks: `isMortgaged` (false in stage 4) is used for
   - zero rent of a mortgaged asset;
   - group doubling (mortgaged assets count);
   - logistics and energy holdings (mortgaged assets don't count);
   - build legality (no mortgage anywhere in the group).
5. Landing on another active player's asset with rent > 0 opens `rent`,
   with the amount fixed at landing.
   - Landing on one's own asset, on a resigned owner's asset, or with rent 0
     opens nothing.
   - The interim jail release move is a landing too.
6. `PayRent` (turn owner, `turn` guard, payload null) pays.
   - `EndTurn`, the turn `Timeout` and any turn closure pay automatically
     through `settleMandatory`.
   - Interim shortfall: the payer pays their whole balance, and `RentPaid`
     records the amount, what was paid and the shortfall.
   - Balances never go negative.
7. `BuildHouse { assetId }` and `SellHouse { assetId }` follow the design's
   legality list exactly, with one specific error code per failed condition.
   - The build quota is 1 per full turn, and a bonus turn inherits the
     remaining quota.
   - House cost is `Q(50%·price)`; a sale refunds `Q(50%·cost)`.
8. Pure helpers `rentFor`, `buildLegality` and `saleLegality` are exported.
   The handlers use them; they are safe for the client to use for display.
9. Resignation during an open settlement goes through one function,
   `resignDuringRent`, with the design defaults R1/R2. The PR merges only
   after the CTO answer is recorded in `ROADMAP.md`; a different answer
   changes only that function and its tests.
10. Projection: `houses`, `rent` and `rentQuotes` (energy as formula inputs)
    are public, along with every balance.
11. Events: `RentDue`, `RentPaid`, `HouseBuilt`, `HouseSold`;
    `BalanceChanged` reasons `rent`, `build`, `house-sale`.
12. `core-6` is the sole supported rules version.

Technical proof:

13. Table tests for every formula, for every price in `prices-1`, and for
    every holding count N:
    - regular: 0-4 houses, with and without the full group;
    - logistics: N = 1..4;
    - energy: N = 1..2 × dice sums 2..12.
14. Tests for:
    - every command and rejection code;
    - evenness on 2- and 3-asset groups;
    - quota carry-over into a bonus turn and reset on a new full turn;
    - auto-payment on `EndTurn` and the turn `Timeout`;
    - shortfall;
    - own asset, resigned owner;
    - jail release landing;
    - resignation R1/R2;
    - no settlement together with a purchase or auction.
15. Replay and restore: a property or golden replay with rent, building and
    selling; restore from a snapshot with an open settlement reproduces the
    state and `pendingDeadlines`.
16. Invariants extended (design § "Invariants") and checked in tests.

## Scope and non-goals

In scope:
- `packages/game-core/src/**` and tests;
- the OpenSpec change (engine deltas);
- mechanical fixture updates outside game-core only where types break the
  build (report each one).

Not in scope:
- the protocol version bump, migrations, server, client (sibling tasks);
- mortgage, debts, bankruptcy, liquidation (stage 5);
- casino, chance, final jail (stage 6); trades (stage 7).

## Canonical references

- `docs/efforts/stage-4-rent-building.md` revision 1 (docs PR #49, branch
  `docs/stage-4-handoff`).
- `docs/efforts/stage-4-rent-building/design.md` § "Core".
- `ROADMAP.md` stage 4; `GAME-BREAKDOWN.md` § "Активы, рента и
  строительство".
- `docs/efforts/stage-3-purchase-auction/design.md` (ownership, decisions,
  `closeTurn`).
- `openspec/config.yaml`, `openspec/specs/engine/*`.

## Constraints and invariants

- The core is headless and deterministic; time comes only from the
  `TransitionContext`.
- Integer money, `Q` at the operation boundary.
- Rejected commands never mutate state or consume RNG.
- One revision per accepted command.
- Balances are never negative.
- Target ids are never reused.

## Dependencies

None upstream (main `6a60bdc`).

**Merge gate:** the answer to R is recorded in `ROADMAP.md`.

The server and client tasks start after this merges and use the exported
names from the design.

## Delegated decisions

Module split, event payload details beyond the design, error code names
(keep one per condition), test helpers.

Return to the Team Lead before changing:
- the state shape, command names or payloads;
- the quota semantics;
- the rounding choices.

Product questions go to the Team Lead.

## Required workflow

Explore -> Propose (OpenSpec change, proposal checkpoint reported with
`agentctl engineer report --wake`) -> Team Lead approval -> Apply in a fresh
context -> Verify -> PR -> start the independent review yourself
(`agentctl review start`) -> Review fixes. Archive the OpenSpec change in the
PR once review passes.

## Required checks

- `pnpm build`, `pnpm test`;
- `openspec validate --all --strict`;
- `git diff --check`;
- green CI on the PR head (all jobs).

If the `core-6` command or RNG stream changes the shared seeded Compose
scenario, re-pin it (test data only) and report.

## Escalation conditions

- A case the rules don't determine.
- A conflict with the existing turn, jail or auction rules.
- A needed contract change.
- Inability to prove a criterion deterministically.

## Deliverables

- the OpenSpec change, code and tests;
- branch `agent/task-s4-core`, the PR and CI evidence;
- the independent review report;
- residual risks.

The Engineer accepts the exact revision before editing. A material change
creates a new revision.
