# Team Lead -> Engineer Task Handoff

```yaml
id: TASK-s5-core-debts
revision: 1
effort: EFF-stage-5-mortgage-debts-bankruptcy
project: economic-board-game
source_commit: TBD # main after TASK-s5-core-mortgage (PR #60) merges
owner: team-lead
status: proposed
```

## Outcome

`packages/game-core` settles mandatory payments under handoff revision 2:
- cash only when it is enough;
- immediate bankruptcy when even full liquidation could not cover the debt;
- otherwise the owner's tiered liquidation, stopping at the first step that
  covers the debt.

A bankrupt player is eliminated and their assets return to the bank. The
last active player wins. The stage 4 interim shortfall rule is removed.

## Acceptance criteria

Product (handoff revision 2 C6-C9, C11; design § "Debt settlement",
"Liquidation order", "Bankruptcy"):

1. **One function, `settleDebt`,** used by `PayRent` and by
   `settleMandatory` (every turn closure). It covers the three cases of the
   design in order.
2. **Immediate bankruptcy check:** `cash + Σ resale of all houses + Σ
   advances of all non-mortgaged assets < debt`.
3. **Liquidation order** exactly as the design § "Liquidation order":
   - complete-group definition (monopoly / all 4 logistics / both energy;
     mortgaged assets count);
   - current rent recomputed before every step (energy at dice sum 7);
   - asset key `(current rent, price, assetId)`;
   - tier 1 (bare assets outside complete groups), tier 2 (bare assets in
     complete groups), tier 3 (group key `(Σ current rent of built assets,
     Σ their price, groupId)`; sell from the most built asset; mortgage an
     asset as soon as it is bare);
   - stop after the first step that covers the debt (a covering sale leaves
     its asset unmortgaged);
   - I6: tiers 1-2 consider bare assets only.
4. **Events:**
   - every step emits `AssetMortgaged` / `HouseSold` with `auto: true` and
     its `BalanceChanged`;
   - then `LiquidationApplied { payerId, creditorId, debt, cashBefore,
     raised, steps }`;
   - then the payment and `RentPaid { payerId, ownerId, assetId, amount,
     auto }` (the `shortfall` and `paid` fields are removed).
5. **Bankruptcy** as the design § "Bankruptcy":
   - sell all houses;
   - `paid = min(debt, cash after sales)` (I3, confirmed by the CTO: no
     mortgages taken);
   - release every asset (`AssetsReleased reason 'bankrupt'`, only
     when the list is non-empty, as for resignation) and emit
     `PlayerBankrupt { playerId, creditorId, debt, paid, writtenOff }`;
   - `cancelOffersOf`;
   - eliminate the player (`eliminations` reason `bankrupt` with
     `creditorId`; removed from order, positions, jail and every mortgage's
     `pending`);
   - close the turn with `TurnEnded reason 'bankrupt'`, passing to the
     player after the bankrupt in the old order;
   - from `PayRent` and from automatic payment alike.
6. **Game end** after a bankruptcy when one active player remains: `phase
   finished`, `winner`, `finishedAt`, and the enriched `GameEnded` (from
   TASK-s5-core-mortgage). There is no lap processing and no new turn.
7. **Invariants:** balances never go negative; no eliminated owner remains;
   no `shortfall` remains anywhere.

Technical proof:

8. Table tests:
   - each tier alone covers the debt;
   - the stop happens inside each tier, including a covering sale that
     leaves its asset bare and unmortgaged;
   - tier boundaries (tier 1 exhausted, so tier 2 runs; tier 2 exhausted,
     so tier 3 runs);
   - order ties broken by price then id;
   - rent recomputed between steps (logistics holdings);
   - an energy asset at dice 7;
   - the tier 3 group order;
   - an I1 partial group with houses reached in tier 3;
   - the immediate-bankruptcy boundary (exactly equal → liquidation; 10
     less → bankrupt);
   - bankruptcy payout and write-off;
   - bankruptcy through `PayRent` and through `EndTurn` / `Timeout`;
   - bankruptcy of the second-to-last player ends the game.
9. Replay and restore: a golden or property replay through liquidation,
   bankruptcy and game end; restore after bankruptcy and in `finished`.

## Scope and non-goals

In scope:
- `packages/game-core/src/**` and tests;
- the OpenSpec change (engine deltas);
- mechanical type fixes outside game-core only where the build breaks
  (report each).

Not in scope:
- protocol, migrations, server and client feature work;
- the parked `TASK-s5-planner` module (do not import or revive it);
- casino, chance and the final jail rule (stage 6); trades (stage 7).

## Canonical references

- `docs/efforts/stage-5-mortgage-debts-bankruptcy.md` **revision 2** (merged,
  main `ec11867`).
- `docs/efforts/stage-5-mortgage-debts-bankruptcy/design.md` (docs PR #58,
  branch `docs/stage-5-tl-design`): Interpretations I3, I4, I6; "Debt
  settlement", "Liquidation order", "Bankruptcy", "Invariants".
- The merged TASK-s5-core-mortgage change (PR #60): state, `isMortgaged`,
  `mortgageAdvance`, release helpers, eliminations, `GameEnded`.

## Constraints

- The core is headless and deterministic. Integer money.
- Rejected commands never mutate state or consume RNG.
- One revision per accepted command.
- Liquidation and bankruptcy are atomic inside the paying command.

## Dependencies

Starts after `TASK-s5-core-mortgage` (PR #60) merges. Rebase on it.

## Delegated decisions

Module split, event payload details beyond the design, test helpers. Return
to the Team Lead before changing:
- the tier order, the keys or the stop rule;
- the bankruptcy payout;
- event names.

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

## Escalation conditions

- A liquidation case the order does not determine.
- A conflict with turn, auction or resignation flows.
- A needed contract change.

## Deliverables

- the OpenSpec change, code and tests;
- branch `agent/task-s5-core-debts`, the PR and CI evidence;
- the independent review report;
- residual risks.

The Engineer accepts the exact revision before editing. A material change
creates a new revision.
