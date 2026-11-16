# Team Lead -> Engineer Task Handoff

```yaml
id: TASK-s3-core
revision: 2
effort: EFF-stage-3-purchase-auction
project: economic-board-game
source_commit: 5bf02e9 # effort handoff revision 2 (D1 resolved)
owner: team-lead
status: proposed
```

## Outcome

`packages/game-core` runs stage 3 rules under `core-5`: ownership, the
buy-or-auction decision on landing on a free asset, the auction with cyclic
responses, 10 s response deadlines, leader reservation, turn timer pause and
resume, and the interaction with `EndTurn`, turn timeout, bonus turns and
resignation.

## Acceptance criteria

Product (effort handoff C1-C11 and C14, unchanged in meaning):

1. Landing on a free monopoly/logistics/energy cell (after any lap reward)
   opens a decision for the landing player; landing on an owned asset has no
   effect.
2. `BuyAsset` succeeds only when balance ≥ price: debit, owner set, decision
   cleared. Unaffordable buy is rejected without state change; `StartAuction`
   is always allowed with a pending decision.
3. `EndTurn` or the turn deadline with a pending decision starts the auction;
   after resolution the turn closes through `closeTurn` (bonus turn by
   existing rules).
4. Start bid `Q(60% × price)`, step `Q(5% × price)`, both positive for every
   `prices-1` price. `Bid` has payload `null`: the first bid is exactly the
   start bid and every later bid exactly the leading bid plus the step
   (owner decision D1, handoff revision 2), computed by `nextBidAmount`.
5. Cyclic order in turn order from the landing player; pass irreversible;
   leader skipped; 10 s without response = pass (system `Timeout` on the
   `auctionResponse` target); every active player participates.
6. A bid whose computed amount exceeds the bidder's balance is rejected; the leader's bid is its
   reservation (derived from the auction).
7. When every opponent of the leader has passed, the leader pays and owns;
   with no bid the asset stays free.
8. During the auction the turn is paused (`pausedRemainingMs`), its deadline
   is not pending, and `RollDice`, `EndTurn`, `BuyAsset`, `StartAuction` and
   the turn `Timeout` are rejected. After `reason 'choice'` the turn resumes
   with the remaining time; after `'end-turn' | 'timeout'` it closes.
9. Bids and passes are accepted only from the responder with the current
   `auctionResponse` id; a stale or duplicate command never applies twice.
10. Projection: `owners`, `purchase`, `auction` and balances are public.
11. Resignation follows E1 as implemented in `resignDuringPurchase` (design §
    "Open product inputs"); a game ending by resignation drops any decision
    or auction.

Technical proof:

12. Unit tests for every command and rejection, auction advance/resolve paths
    (2..6 players, all-pass unsold, single bid wins, leader skipped, AFK
    timeouts, over-balance bid), timer pause/resume arithmetic, bonus turn
    after an end-turn auction, jail-release landing, resignation cases (a)-(d).
13. Replay: property/golden replay with decisions and auctions; restore from a
    mid-auction snapshot reproduces state and `pendingDeadlines`.
14. A test that start bid and step are positive quanta for every price.

## Scope and non-goals

In scope: `packages/game-core/src/**`, tests, OpenSpec change (engine deltas).
Mechanical updates outside game-core only where the build breaks on changed
types (fixtures), each reported.

Not in scope: protocol version bump, migration, client UI (sibling tasks);
rent, building, mortgage, bankruptcy, trades, casino, chance, final jail.

## Canonical references

- `docs/efforts/stage-3-purchase-auction.md` revision 2.
- `docs/efforts/stage-3-purchase-auction/design.md` § "Core", § "Open product inputs".
- `ROADMAP.md` stage 3; `GAME-BREAKDOWN.md` § "Покупка и аукцион",
  § "Начальная настройка и деньги".
- `openspec/config.yaml`, `openspec/specs/engine/*`.

## Constraints and invariants

Headless deterministic core; time only from `TransitionContext`. Integer
money (`Q`). Rejected commands never mutate state or consume RNG. One revision
per accepted command. Target ids never reused. Balances never negative.

## Dependencies

None upstream (main `5bf02e9`). **Merge gate:** the PR may complete review but
is merged only after E1 is recorded (handoff revision or `ROADMAP.md`); if the
answer differs from the default, only `resignDuringPurchase` and its tests
change. Server and client tasks start after this merges and use
the exported names in the design.

## Delegated decisions

Module split, event payload details, error code names, test helpers. Return
to the Team Lead before changing state shape, command names, target kinds or
the pause representation. Product questions go to the Team Lead.

## Required workflow

Explore -> Propose (OpenSpec change, proposal checkpoint reported with
`agentctl engineer report --wake`) -> Team Lead approval -> Apply in a fresh
context -> Verify -> PR -> Review fixes. Archive the OpenSpec change in the
PR once review passes.

## Required checks

`pnpm build`, `pnpm test`, `openspec validate --all --strict`,
`git diff --check`, green CI (both jobs) on the PR head. If the core-5 RNG or
command stream changes the shared Compose seed scenario, re-pin it as in
stage 2 (test data only) and report.

## Escalation conditions

A case the rules do not determine; a conflict with existing turn/jail rules;
a needed contract change; inability to prove a criterion deterministically.

## Revision history

- 1: initial.
- 2: D1 resolved by the owner: `Bid` is a fixed raise with payload `null`
  (criteria 4, 6); merge gate now E1 only.

## Deliverables

OpenSpec change, code and tests, branch `agent/task-s3-core`, PR, CI evidence,
independent review report, residual risks.

The Engineer accepts the exact revision before editing. A material change
creates a new revision.
