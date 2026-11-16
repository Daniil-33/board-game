# Team Lead -> Engineer Task Handoff

```yaml
id: TASK-s3-int-restart
revision: 1
effort: EFF-stage-3-purchase-auction
project: economic-board-game
source_commit: ca19e39 # main with docs PRs #33/#41 and the e2e fix (PR #40)
owner: team-lead
status: proposed
```

## Outcome

The server integration test `apps/server/src/__tests__/e2e.int.test.ts`
"Server restart: both players reconnect, Welcome at the persisted revision,
play continues" passes deterministically, and any server defect behind its
failure is fixed.

## Failure

CI run 43869006795 (docs-only PR #33), job `ci`, step "Integration test
(Postgres)": `e2e.int.test.ts:52` `expect(room.state.revision).toBe(before + 1)`
got 12 instead of 13, called from line 173 (a `move` on the restored server
`s2`). In the auction branch of `move`, the test advances the fake clock to
`auction.responseDeadline` and awaits `whenIdle(room)`, but the response
`Timeout` did not apply.

Team Lead notes (verify, don't take as given): the moves come from real dice,
so an auction after the restart happens only on some runs, which explains
the flakiness. Not related to the client reconnect schedule (this test uses
its own socket client). Possible causes: (a) a server defect: after
`restore: true`, deadlines of transitions applied on `s2` are armed on a
different clock/scheduler than `s2.clock`, or are not armed, or fire only
strictly after the deadline; (b) a test race: `whenIdle` resolves before the
timer callback's command runs; (c) something else.

## Acceptance criteria

1. Root cause identified and stated with evidence (a deterministic
   reproduction: force the auction branch after the restart, e.g. by a seeded
   test context or by driving moves until an auction exists on `s2`).
2. If it is a server defect (timers after restore, auction deadline on
   restored rooms, clock wiring): fix it in `apps/server` and add a
   deterministic regression test: restart, then a decision/auction opened on
   the restored server whose response deadline fires on the fake clock. Real
   restart behaviour in production (real clock) must be covered by the same
   code path.
3. If it is a test defect: fix the test or its helpers without weakening any
   assertion (the timeout must still be observed through state and
   broadcast).
4. Make the existing restart test deterministic about whether it exercises
   an auction (both branches covered by named tests rather than by dice).
5. Stability: `pnpm test:integration` passes 10 times in a row locally
   (report the loop), and CI is green on the PR head.
6. Scan the other integration tests for the same pattern (dice-dependent
   auction branch after a restart or across a fake-clock advance) and fix
   them the same way.

## Scope and non-goals

In scope: `apps/server/**` (code and tests). Not in scope: game-core rules,
protocol, client, e2e browser specs, workflows. A needed core change returns
to the Team Lead.

## Canonical references

- `docs/efforts/stage-3-purchase-auction/design.md` § "Server" (timers from
  `pendingDeadlines`, restart and reload).
- `openspec/specs/server/*` (timers, recovery).

## Constraints and invariants

Core -> persist -> broadcast; timers only from `pendingDeadlines`; recovery
from snapshot plus tail; no rules logic in the server.

## Required workflow

Explore -> short plan with the root cause in a report
(`agentctl engineer report --wake`) -> Team Lead approval -> Apply -> Verify
-> PR -> start the independent review yourself (`agentctl review start`,
base = `source_commit`) -> report. An OpenSpec change only if server
behaviour changes.

## Required checks

`pnpm build`, `pnpm test`, `pnpm test:integration` (10x loop locally),
`openspec validate --all --strict`, `git diff --check`, green CI (both jobs)
on the PR head.

## Escalation conditions

A defect in game-core or the protocol; a recovery behaviour the specs do not
determine.

## Deliverables

Branch `agent/task-s3-int-restart`, PR, CI evidence, loop logs in
`/srv/agents/evidence/TASK-s3-int-restart/` (never committed), review report,
residual risks.

The Engineer accepts the exact revision before editing.
