# Team Lead -> Engineer Task Handoff

```yaml
id: TASK-s5-core-mortgage
revision: 1
effort: EFF-stage-5-mortgage-debts-bankruptcy
project: economic-board-game
source_commit: dcd39b3 # main; effort handoff in docs PR #57
owner: team-lead
status: proposed
```

## Outcome

`packages/game-core` runs `core-7` with:
- mortgage and redeem;
- the per-mortgage collective-lap counter and expiry at the turn boundary;
- resignation that frees the resigner's assets;
- elimination records and `finishedAt`;
- house sales and mortgages allowed during the player's own open rent.

Debt settlement keeps the stage 4 interim shortfall until
`TASK-s5-core-debts`, so `main` stays deployable.

## Acceptance criteria

Product (handoff C1-C5, C10, C11 partly, C12 partly; exactly as in the
design § "Core"):

1. **State.** `mortgages`, `eliminations` and `finishedAt` as in the design.
   `isMortgaged` reads `mortgages`.
2. **`Mortgage { assetId }`** follows the design's legality and check order,
   with one error code per condition. Its effect:
   - advance `Q(50% price)`, `BalanceChanged` reason `mortgage`;
   - `AssetMortgaged { playerId, assetId, advance, auto: false }`;
   - `pending` = the current order.
   - Design I1: allowed next to houses on other assets of the group.
3. **`Redeem { assetId }`** follows the design's legality: the stored
   advance, `BalanceChanged` reason `redeem`, `AssetRedeemed`, and
   `RENT_PENDING` while rent is open.
4. **Pure helpers** `mortgageLegality`, `redeemLegality` and
   `mortgageAdvance` are used by the handlers and safe for the client.
5. **`SellHouse` during an open rent.** It no longer rejects with
   `RENT_PENDING` when the seller is the payer; `BuildHouse` still does.
6. **Lap counter and expiry** exactly as the design § "Collective lap and
   expiry":
   - every closed turn counts, bonus and jail turns included;
   - eliminated players leave `pending` at once;
   - laps complete only at a turn boundary;
   - expiry frees the asset, keeps the advance, and emits `MortgageExpired`
     after `TurnEnded` and before the next `TurnStarted`.
7. **Mortgaged assets in rent.** Mortgaged assets bring rent 0 (no
   settlement opens). Doubling counts them; logistics and energy holdings
   don't. Building is blocked by a mortgage in the group (stage 4 core
   RVW-002 is covered by tests).
8. **Resignation** frees all of the resigner's assets (owners, houses,
   mortgages) with `AssetsReleased reason 'resigned'`.
   - The balance is unchanged and R1/R2 are unchanged.
   - It records `eliminations` (`reason 'resigned'`, `at`).
   - It calls the no-op hook `cancelOffersOf`.
   - The interim "resigned owner's asset brings no rent" code path is
     removed.
9. **Game end** sets `finishedAt`. `GameEnded { winner, at, eliminations,
   finalBalances }`.
10. **Projection:** `mortgages` with `remainingLaps` and `pending`,
    `eliminations`, and `result` in `finished`, all public.
11. `core-7` is the sole rules version. Invariants are extended per the
    design (except the debt-specific ones, which come with core-debts).

Technical proof:

12. Tests for:
    - every new command and rejection code;
    - mortgage next to houses (I1);
    - redeem during rent rejected; mortgage and sale during rent allowed;
    - rent table tests with mortgaged assets: regular doubling with a
      mortgaged sibling, logistics N with mortgaged ones, energy with a
      mortgaged sibling, a mortgaged asset quoting 0;
    - lap counting with 2 and 3 players, including a bonus turn, a jail
      turn, a resignation mid-lap and a mortgage taken mid-lap;
    - expiry after exactly 8 laps and not before;
    - resignation freeing assets.
13. Replay and restore: a golden or property replay through mortgage,
    redeem and expiry; restore from a snapshot mid-term reproduces
    `mortgages`.

## Scope and non-goals

In scope:
- `packages/game-core/src/**` except the new liquidation module;
- tests;
- the OpenSpec change (engine deltas);
- mechanical type fixes outside game-core only where the build breaks
  (report each).

Not in scope:
- the liquidation planner (`TASK-s5-planner`, in parallel);
- settlement, liquidation and bankruptcy wiring (`TASK-s5-core-debts`);
- protocol, server and client.

## Canonical references

- `docs/efforts/stage-5-mortgage-debts-bankruptcy.md` revision 1 (docs PR
  #57).
- `docs/efforts/stage-5-mortgage-debts-bankruptcy/design.md` § "Versions",
  "Interpretations", "Core" (state, mortgage, lap, resignation, game end,
  invariants, projection).
- `docs/efforts/stage-4-rent-building/design.md` (hooks, check order).
- `ROADMAP.md` stage 5 owner decisions; `GAME-BREAKDOWN.md` § "Ипотека и
  расчёт долгов".

## Constraints

- Headless and deterministic; time comes only from `TransitionContext`.
- Integer money; rejected commands never mutate state or consume RNG.
- One revision per accepted command.
- Persisted event shapes are versioned by `core-7`.

## Dependencies

None upstream. It runs in parallel with `TASK-s5-planner`; the second to
merge rebases `index.ts`.

## Delegated decisions

Module split, event payload details beyond the design, error code names (one
per condition), test helpers. Return to the Team Lead before changing the
state shape, command names, lap semantics or expiry timing.

## Required workflow

Explore -> Propose (OpenSpec change; `agentctl engineer report --wake`) ->
Team Lead approval -> Apply in a fresh context -> Verify -> PR -> start the
independent review yourself (`agentctl review start`) -> review fixes.
Archive the OpenSpec change in the PR once review passes.

## Required checks

- `pnpm build`, `pnpm test`;
- `openspec validate --all --strict`;
- `git diff --check`;
- green CI on the PR head (all jobs).

If the shared seeded Compose scenario changes, re-pin it (test data only) and
report.

## Escalation conditions

- A case the rules don't determine (for example, a lap or expiry
  interaction with auctions or jail that the design does not cover).
- A conflict with existing turn, auction or jail rules.
- A needed contract change.

## Deliverables

- the OpenSpec change, code and tests;
- branch `agent/task-s5-core-mortgage`, the PR and CI evidence;
- the independent review report;
- residual risks.

The Engineer accepts the exact revision before editing. A material change
creates a new revision.
