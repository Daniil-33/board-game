# Team Lead -> Engineer Task Handoff

```yaml
id: TASK-s5-planner
revision: 1
effort: EFF-stage-5-mortgage-debts-bankruptcy
project: economic-board-game
source_commit: dcd39b3 # main; effort handoff in docs PR #57
owner: team-lead
status: proposed
```

## Outcome

A pure, exact liquidation planner in `packages/game-core`, with a brute-force
reference and a measured worst-case time. It decides which houses to sell and
which assets to mortgage to cover a deficit with minimal loss. It does not
touch game state, commands or events. `TASK-s5-core-debts` wires it in.

## Interface (from the design; names may be refined in the proposal)

```ts
interface PlannerAsset {
  readonly assetId: AssetId;
  readonly cell: number;          // board order
  readonly price: Money;
  readonly houses: number;        // 0..4
  readonly mortgaged: boolean;
}
interface PlannerGroup {
  readonly groupId: string;
  readonly firstCell: number;               // group order = board order of first cell
  readonly assets: readonly PlannerAsset[]; // the payer's assets of the group, board order
}
interface PlannerInput {
  readonly deficit: Money;                  // > 0
  readonly groups: readonly PlannerGroup[];
  /** Σ reference rent of the payer's assets of this group in this configuration. */
  readonly referenceRent: (group: PlannerGroup, config: readonly { assetId: AssetId; houses: number; mortgaged: boolean }[]) => Money;
}
type PlannerAction = { kind: 'sell-house' | 'mortgage'; assetId: AssetId };
interface LiquidationPlan {
  readonly actions: readonly PlannerAction[];  // legal application order
  readonly proceeds: Money; readonly loss: Money; readonly surplus: Money; readonly affected: number;
}
function maxProceeds(input): Money;
function planLiquidation(input): LiquidationPlan | null; // null when maxProceeds < deficit
```

The planner uses game-core's `houseCost` and `houseRefund` and the mortgage
advance `Q(50% × price)`. Export the advance as a helper, for example
`mortgageAdvance(price)`, unless `TASK-s5-core-mortgage` already does.

## Acceptance criteria

1. **Options per group.** For each group, enumerate every reachable final
   configuration:
   - even `h' ≤ h`;
   - new mortgages only on assets with `h' = 0`;
   - existing mortgages stay;
   - design I1: a 0-house asset may be mortgaged next to houses.
2. **Objective.** Exactly as the design § "Liquidation search":
   - `loss = Σ (cost − refund) of sold houses + 8 × Δ reference rent` (I2:
     no advances in the loss);
   - lexicographic: loss, surplus, affected, then the id key.
3. **Exact DP.** Dynamic programming over exact proceeds as in the design,
   with no pruning. Add a short proof comment in the module that restates
   the design argument.
4. **Plan action order.** House sales group by group in board order, each
   from the current group maximum (ties by board order), then mortgages in
   board order. Every prefix of the actions is a legal state: evenness holds
   and only 0-house assets are mortgaged.
5. **`null` exactly when the deficit cannot be covered.** `maxProceeds`
   equals the proceeds of full liquidation.

Technical proof:

6. A brute-force reference (test code only):
   - breadth-first search over single legal actions gives every reachable
     final state;
   - the objective is evaluated on the whole portfolio, with no per-group
     decomposition;
   - the minimum is picked by the same lexicographic order.
7. Comparison tests:
   - at least 500 seeded generated portfolios (up to 4 groups, up to 3
     houses, mixed existing mortgages, regular/logistics/energy);
   - hand-written edge cases: ties on loss broken by surplus; ties broken by
     affected count; ties broken by id key; doubling loss; logistics and
     energy holdings loss; exact cover (surplus 0); mortgages only; houses
     only; `null`.
   - Use a test reference-rent function implementing the stage 4 formulas
     (doubling counts mortgaged assets, holdings count only non-mortgaged
     ones, energy dice sum 7). `TASK-s5-core-debts` repeats the comparison
     with the real `rentFor`.
8. Worst case:
   - one player owns all 28 assets of the classic board, with 4 houses on
     every monopoly asset and no mortgages;
   - deficits of `maxProceeds`, `maxProceeds − 10` and about half;
   - measure and log the time; the test asserts < 1000 ms;
   - report the measured time (the design target is ≤ 100 ms) in the PR and
     the evidence.
9. Determinism: identical input gives an identical plan. Input group and
   asset order does not change the result (the planner sorts by
   `firstCell` / `cell`).

## Scope and non-goals

In scope:
- a new `packages/game-core/src/liquidation.ts` (or a `liquidation/`
  directory);
- its tests;
- one export line in `index.ts`;
- the OpenSpec change (engine delta: the liquidation planner requirement).

Not in scope:
- `GameState`, commands, events and `rent.ts` (owned by
  `TASK-s5-core-mortgage` in parallel);
- wiring into settlement;
- bankruptcy.

## Canonical references

- `docs/efforts/stage-5-mortgage-debts-bankruptcy.md` revision 1, C6-C8
  (docs PR #57, branch `docs/stage-5-handoff`).
- `docs/efforts/stage-5-mortgage-debts-bankruptcy/design.md` § "Liquidation
  search and proof of optimality", Interpretations I1-I2.
- `packages/game-core/src/houses.ts` (`houseCost`, `houseRefund`, evenness)
  and `rent.ts` (formulas).

## Constraints

- Pure and deterministic, with integer money.
- No `Date`, `Math.random` or global state.
- No greedy shortcut anywhere: every option and every proceeds value is
  kept.

## Dependencies

None. It runs in parallel with `TASK-s5-core-mortgage`. If both add an
`index.ts` export, the second to merge rebases.

## Delegated decisions

Internal data structures, how options are enumerated, the generators, and
the brute-force implementation. Return to the Team Lead before changing the
objective, the tie-breakers, the action order or the interface semantics.

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

- The worst case cannot meet < 1 s.
- An option or objective case the design does not determine.
- A brute-force mismatch that you cannot attribute to a bug.

## Deliverables

- the OpenSpec change, code and tests;
- branch `agent/task-s5-planner`, the PR and CI evidence;
- the measured worst-case time in `/srv/agents/evidence/TASK-s5-planner/`;
- the independent review report;
- residual risks.

The Engineer accepts the exact revision before editing. A material change
creates a new revision.
