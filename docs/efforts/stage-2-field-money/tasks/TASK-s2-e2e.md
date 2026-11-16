# Team Lead -> Engineer Task Handoff

```yaml
id: TASK-s2-e2e
revision: 1
effort: EFF-stage-2-field-money
project: economic-board-game
source_commit: <main after TASK-s2-server and TASK-s2-client merge; set at delivery>
owner: team-lead
status: proposed
```

## Outcome

Browser evidence that stage 2 works through Compose end to end, the stage 1
scenarios still pass under `core-4`, and `ROADMAP.md` records stage 2 as done.

## Acceptance criteria

Product (effort handoff "Completion evidence"):

1. Playwright, 2 and 3 browser clients: every client shows the same generated
   board (compare cell names and prices) and start balances equal to `C(N)`.
2. Two newly created games differ in composition.
3. A move that passes start credits the lap reward and every client's panel
   shows the new balance.
4. A seeded third double sends the player to jail and credits nothing.
5. Server restart mid-game and tab reload keep board and balances.
6. The asset card opens from a board click in a real browser.
7. Stage 1 Compose scenarios still pass (TASK-s2-core re-pinned the shared
   seed to 4491 for `core-4`); any additional seeds needed for stage 2
   scenarios are chosen and documented in the spec file.
8. `ROADMAP.md` "Сделано" lists stage 2 with links to the merged PRs.

Technical proof:

9. `pnpm test:e2e` (or the existing Compose e2e command) green locally and in
   the CI compose-browser job; screenshots/trace of the 3-client run attached
   to the report.

## Scope and non-goals

In scope: `e2e/**`, `docker-compose.e2e.yml`, CI e2e wiring, test-only seed
hooks already present, `ROADMAP.md` "Сделано", OpenSpec deployment delta if
needed.

Not in scope: product code changes; a defect found in core/server/client is
reported to the Team Lead, who routes it.

## Canonical references

- `docs/efforts/stage-2-field-money.md` revision 1 "Completion evidence".
- `docs/efforts/stage-2-field-money/design.md` § "Evidence plan".
- `docs/efforts/stage-1-skeleton/tasks/TASK-s1-compose-e2e.md` (existing
  harness).
- `openspec/specs/deployment/*`.

## Constraints and invariants

Test-only seed hooks stay refused outside `NODE_ENV=test`; the stack binds
`127.0.0.1`.

## Dependencies

Starts after `TASK-s2-server` and `TASK-s2-client` merge.

## Delegated decisions

Scenario structure, seed search method, selectors (add `data-testid` in the
client only if missing, and report it).

## Required workflow

Explore -> Propose (OpenSpec change if a spec changes) -> Apply -> Verify ->
PR -> Review fixes. Small task: context reset before Apply is not required.

## Required checks

Compose e2e locally and in CI, `pnpm build`, `pnpm test`,
`openspec validate --all --strict`, `git diff --check`.

## Escalation conditions

A scenario fails because of product code; a criterion that cannot be shown
deterministically.

## Deliverables

Branch `agent/task-s2-e2e`, PR, CI evidence, screenshots/traces, independent
review report, residual risks.

The Engineer accepts the exact revision before editing. A material change
creates a new revision.
