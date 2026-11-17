# Team Lead -> Engineer Task Handoff

```yaml
id: TASK-s4-e2e
revision: 1
effort: EFF-stage-4-rent-building
project: economic-board-game
source_commit: 3edbba9 # main after TASK-s4-server (#54) and TASK-s4-client (#55)
owner: team-lead
status: proposed
```

## Outcome

Browser evidence through Compose that stage 4 works end to end. Earlier
scenarios still pass, and `ROADMAP.md` records stage 4 as done.

## Acceptance criteria

Product (effort handoff "Completion evidence"). Every scenario uses 3
browser clients and asserts against server-projected state in every client:

1. Rent on an asset with no houses, then on a full group (doubled).
2. Logistics rent with 2 holdings.
3. Energy rent with the dice sum shown.
4. Rent auto-paid at the turn deadline.
5. Landing on one's own asset opens nothing.
6. Building:
   - building respects evenness and one house per turn (a double's bonus
     turn is a new turn and allows another house, owner decision
     2026-11-16);
   - an illegal build is rejected, and its reason is shown in the UI;
   - selling a house works.
7. The interim shortfall pays the whole balance (the event records the
   shortfall).
8. Tab reload and server restart with an open rent settlement preserve it,
   and it is still paid automatically at the deadline.
9. Stage 1-3 scenarios still pass. Any seed changes are test data only and
   documented.
10. `ROADMAP.md` "Сделано" lists stage 4 with links to the merged PRs.

Technical proof:
- Compose e2e is green locally and in the CI browser jobs.
- Sanitized traces and screenshots are kept in
  `/srv/agents/evidence/TASK-s4-e2e/` (never committed).
- CI headroom is reported: if a browser job exceeds about 25 of its 35
  minutes, report it.

## Approach

Use the server's test-only fixture loader (`NODE_ENV=test`,
`E2E_FIXTURES=1`) to start scenarios from known ownership, houses, balances
and positions. Dice remain real.
- Choose fixtures so that any landing exercises the scenario, or loop over
  turns within a bounded number.
- Keep each scenario deterministic in what it asserts.
- Restart scenarios run on a stack where restart is possible.

The fixture stack is a separate test-only Compose override. It is never
used for staging or production.

## Scope and non-goals

In scope:
- `e2e/**`;
- `docker-compose.e2e.yml` and test-only Compose overrides;
- CI workflow wiring of the new browser specs within the existing jobs;
- `ROADMAP.md` "Сделано".

Not in scope: product code. A product defect goes to the Team Lead.

## Canonical references

- `docs/efforts/stage-4-rent-building.md` revision 1, "Completion
  evidence".
- `docs/efforts/stage-4-rent-building/design.md` § "Evidence plan",
  § "Server" (fixtures).
- Existing `e2e/stage3.spec.ts` and its helpers. The stage 3 lessons on
  timing guards and saved targets apply.

## Dependencies

Starts after `TASK-s4-server` and `TASK-s4-client` merge.

## Required workflow

Explore -> short plan (`agentctl engineer report --wake`) -> Team Lead
approval -> Apply -> Verify -> PR -> start the independent review yourself
-> report.

## Required checks

- `pnpm typecheck:e2e`;
- `git diff --check`;
- local Compose runs;
- green CI (all jobs) on the PR head.

## Deliverables

- branch `agent/task-s4-e2e`, the PR and CI evidence;
- traces and screenshots in the evidence directory;
- the independent review report;
- residual risks.

The Engineer accepts the exact revision before editing.
