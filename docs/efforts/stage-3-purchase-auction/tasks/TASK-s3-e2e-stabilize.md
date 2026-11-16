# Team Lead -> Engineer Task Handoff

```yaml
id: TASK-s3-e2e-stabilize
revision: 1
effort: EFF-stage-3-purchase-auction
project: economic-board-game
source_commit: 78478c6 # main; stage 3 e2e merged at 37774f4
owner: team-lead
status: proposed
```

## Outcome

The stage 3 restart scenario in `e2e/stage3.spec.ts` (test at line 153,
"turn deadline starts the auction, reload and server restart keep it, the
turn closes") passes reliably on main, keeping all of its assertions.

## Failure

Main CI run 43857188082 (head 37774f4), job `compose-browser`:
`stage3.spec.ts:209` `expect(afk.id).toBe(saved.auction!.responder)`
received a different player. The same spec passed on the PR head
(run 43854620956) and locally.

Team Lead analysis (verify it, don't take it as given): after the restart the
guard only requires reconnect before `responseDeadline - 1 s`. The loop then
checks every client and takes 3 full-page screenshots (`shoot`) before
`afkPass(players)`. `afkPass` reads `responder` from the *current* host view.
If the saved responder's deadline has already fired, the current responder is
the next player, so `afkPass` waits for that player's auto-pass and line 209
fails. This is a test race, not a product defect.

## Acceptance criteria

1. Root cause confirmed from the CI log/trace (artifact of run 43857188082)
   or by a local reproduction, and stated in the report.
2. The scenario observes the auto-pass of the saved responder
   (`saved.auction.responder`, `saved.auction.responseDeadline`), not
   whoever is responder when the helper starts. For example: `afkPass`
   takes the expected auction/responder, and screenshots or other slow work
   happen after the AFK pass or are guarded by an explicit remaining-window
   check with a timing message.
3. No assertion is weakened or removed: the restart still has to finish
   inside the response window, state is still equal after restart, the
   persisted deadline is still enforced (`auto: true`, at or after the
   deadline, within `TRANSPORT_MS`), and the turn still closes after
   settlement.
4. Any other scenario with the same pattern (a slow step between becoming
   responder and `afkPass`) is fixed the same way.
5. Stability evidence: the stage 3 spec passes on the local Compose
   production stack at least 3 times in a row (`--repeat-each` or separate
   runs). The CI `compose-browser` job is green on the PR head.

## Scope and non-goals

In scope: `e2e/**` only. Not in scope: product code, the workflow
(timeout/sharding is a separate CTO follow-up), seeds, `ROADMAP.md`.
A product defect found on the way goes to the Team Lead.

## Required workflow

Explore -> short plan in the report -> Apply -> Verify -> PR -> start the
independent review yourself (`agentctl review start`, base = `source_commit`)
-> report. No OpenSpec change (test-only, no behavior change).

## Required checks

`pnpm typecheck:e2e` (or the repo's e2e typecheck), `git diff --check`,
local repeated Compose run as above, green CI (both jobs) on the PR head.

## Deliverables

Branch `agent/task-s3-e2e-stabilize`, PR, CI evidence, sanitized local run
logs in `/srv/agents/evidence/TASK-s3-e2e-stabilize/` (never committed),
review report, residual risks.

The Engineer accepts the exact revision before editing.
