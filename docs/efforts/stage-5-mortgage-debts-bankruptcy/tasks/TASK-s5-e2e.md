# Team Lead -> Engineer Task Handoff

```yaml
id: TASK-s5-e2e
revision: 1
effort: EFF-stage-5-mortgage-debts-bankruptcy
project: economic-board-game
source_commit: TBD # main after TASK-s5-client merges
owner: team-lead
status: proposed
```

## Outcome

Browser evidence through Compose that stage 5 works end to end with 3
clients. Earlier scenarios still pass, and `ROADMAP.md` records stage 5 as
done.

## Acceptance criteria

Product (handoff revision 2 "Completion evidence"). Every scenario uses 3
browser clients and asserts against the server-projected state in every
client and the visible UI:

1. **Mortgage, then redeem.**
   - The advance and the redeem amount are shown.
   - Rent drops to 0 and comes back.
   - A disabled control shows its reason (for example Redeem during one's
     own open rent).
2. **Expiry.** A mortgage expires after 8 collective laps and the asset
   becomes free. Use the near-expiry fixture and real turns for the final
   lap(s).
3. **Liquidation.** Rent above cash triggers automatic liquidation. Every
   client shows the liquidation summary (steps in order), then the payment.
   At least one scenario reaches tier 3 (a house sold, then the bare asset
   mortgaged).
4. **Bankruptcy to a player creditor.**
   - The creditor receives the partial amount, and the rest is written off.
   - The bankrupt player's assets become free and their houses are gone.
   - The bankrupt client shows the elimination screen and keeps watching.
5. **Resignation** frees the resigned player's assets on every client.
6. **Winner.** The game reaches a winner. The game-over screen shows the
   winner, the elimination order with reasons and the final balances. It
   survives a tab reload, and the `game_results` row matches.
7. **Restart.** A server restart with mortgages in place preserves the
   mortgages and terms, and the next boundary still counts.
8. **Earlier stages.** Stage 1-4 scenarios still pass. Seed changes are
   test data only and documented.
9. **Roadmap.** `ROADMAP.md` "Сделано" lists stage 5 with links to the
   merged PRs: #60, #61, #62, the client PR and this PR.

Technical proof:
- Compose e2e is green locally and in the CI browser jobs.
- Sanitized traces and screenshots go to
  `/srv/agents/evidence/TASK-s5-e2e/`, never committed.
- CI headroom: compose-browser was 16 min of 35 after the server PR. Report
  it if it exceeds about 25 min. If needed, split the stage 5 specs into the
  seeded job or a parallel shard within the existing workflow, and report
  that.

## Approach

- Use the server's test-only fixture loader (`NODE_ENV=test`,
  `E2E_FIXTURES=1`) and the stage 5 builders from TASK-s5-server:
  - near expiry;
  - one builder per liquidation tier;
  - bankruptcy;
  - final bankruptcy;
  - mortgage restart.
- Dice stay real. Choose fixtures so any landing exercises the scenario, or
  loop over a bounded number of turns.
- You may extend the fixture builders in `apps/server/src/test-fixtures.ts`.
  Add a tier 3 or multi-tier builder there if the existing ones cannot
  reach it.
- Apply the stage 3-4 lessons: timing guards, saved targets, and no
  screenshots inside timing windows.

## Scope and non-goals

In scope:
- `e2e/**`;
- `docker-compose.e2e.yml` and test-only Compose overrides;
- `apps/server/src/test-fixtures.ts` (test-only builders);
- CI wiring of the new specs within the existing workflow;
- `ROADMAP.md` "Сделано".

Not in scope: product code. A product defect goes to the Team Lead.

## Canonical references

- `docs/efforts/stage-5-mortgage-debts-bankruptcy.md` revision 2,
  "Completion evidence".
- `docs/efforts/stage-5-mortgage-debts-bankruptcy/design.md`.
- `e2e/stage4.spec.ts`, `e2e/STAGE4.md` and their helpers.

## Dependencies

Starts after `TASK-s5-server` (#62, merged) and `TASK-s5-client` merge.

## Required workflow

Explore -> short plan (`agentctl engineer report --wake`) -> Team Lead
approval -> Apply -> Verify -> PR -> start the independent review yourself
-> report.

## Required checks

- `pnpm typecheck:e2e`;
- `git diff --check <base> HEAD`;
- local Compose runs;
- green CI (all jobs) on the PR head.

## Escalation conditions

- A product defect.
- A missing fixture capability that needs product code.
- A CI time limit risk.

## Deliverables

- branch `agent/task-s5-e2e`, the PR and CI evidence;
- traces and screenshots in the evidence directory;
- the independent review report;
- residual risks.

The Engineer accepts the exact revision before editing.
