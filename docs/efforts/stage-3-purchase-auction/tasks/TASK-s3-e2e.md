# Team Lead -> Engineer Task Handoff

```yaml
id: TASK-s3-e2e
revision: 1
effort: EFF-stage-3-purchase-auction
project: economic-board-game
source_commit: <main after TASK-s3-server and TASK-s3-client merge; set at delivery>
owner: team-lead
status: proposed
```

## Outcome

Browser evidence through Compose that stage 3 works end to end, earlier
scenarios still pass, and `ROADMAP.md` records stage 3 as done.

## Acceptance criteria

Product (effort handoff "Completion evidence"), 3 browser clients, each
asserted against server-projected state seen in every client:

1. Buy at fixed price: balance debited by the price, owner marker on all
   clients.
2. Decline into an auction won by another player: winner pays the leading
   bid and owns the asset.
3. Auction with no bids leaves the asset free.
4. An AFK participant passes after the real 10 s.
5. Turn deadline without a decision starts the auction and the turn closes
   after it.
6. A bid above the bidder's balance is rejected (Ack error, no state change).
7. Tab reload and server restart during an auction preserve it.
8. Stage 1-2 scenarios still pass; any seed changes are test data only and
   documented in the spec file.
9. `ROADMAP.md` "Сделано" lists stage 3 with links to the merged PRs.

Technical proof: Compose e2e green locally and in the CI compose-browser job;
sanitized traces/screenshots referenced in the report (not committed).

## Scope and non-goals

In scope: `e2e/**`, `docker-compose.e2e.yml` (test seeds only), `ROADMAP.md`
"Сделано". Not in scope: product code; a product defect is reported to the
Team Lead.

## Canonical references

- `docs/efforts/stage-3-purchase-auction.md` revision 1 "Completion evidence".
- `docs/efforts/stage-3-purchase-auction/design.md` § "Evidence plan".
- `e2e/compose.spec.ts`, `openspec/specs/deployment/*`.

## Constraints and invariants

Test-only seed hooks stay refused outside `NODE_ENV=test`; localhost binding;
assertions observe the real UI/socket, never recompute outcomes.

## Dependencies

Starts after `TASK-s3-server` and `TASK-s3-client` merge.

## Delegated decisions

Scenario structure, seed search, selectors (add `data-testid` only if
missing, and report it).

## Required workflow

Explore -> short plan report -> Apply -> Verify -> PR -> start independent
review with `agentctl review start` -> Review fixes.

## Required checks

Compose e2e locally and in CI, `pnpm build`, `pnpm test`,
`openspec validate --all --strict`, `git diff --check`.

## Escalation conditions

A scenario fails because of product code; a criterion that cannot be shown
deterministically.

## Deliverables

Branch `agent/task-s3-e2e`, PR, CI evidence, traces/screenshots, independent
review report, residual risks.

The Engineer accepts the exact revision before editing. A material change
creates a new revision.
