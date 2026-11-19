# Team Lead -> Engineer Task Handoff

```yaml
id: TASK-vd-final-evidence
revision: 1
effort: EFF-visual-design
project: economic-board-game
source_commit: 92e4439 # main after TASK-vd-dialogs-2 (PR #107)
owner: team-lead
status: proposed
```

## Outcome

One complete, honest screenshot set for the visual-design effort at the final
main head. It holds every handoff C3/C4 screen at 1440x900 and 390x844, each
paired with a real (non-blank) design frame, so the Team Lead can review every
pair side by side and resubmit effort-complete to the CTO (gaps G1-G4).

## Acceptance criteria

1. **Final head.** Every app capture is produced by the committed
   env-gated producer (`E2E_SCREEN_EVIDENCE=1`) against stacks built from main
   92e4439, or from your branch if it only adds capture/test code. Each
   per-screen manifest records producerHead and the served `/version.txt`, and
   they match.
2. **Design frames.** Recapture all 18 frames with
   `scripts/capture-design-frames.cjs`. The blank guard must pass for every frame
   and every app image. The collector exits non-zero on any blank image.
3. **Complete pair set.** Cover at least the 35 pairs from TASK-vd-e2e plus
   the TASK-vd-dialogs-2 surfaces: purchase, auction, asset card, rent shortfall,
   liquidation, elimination, game over, jail-attempt status, the
   build-quota toast and the reconnect banner. Nearest-frame substitutions are
   labelled as such.
4. **Meaningful states.**
   - The lobby capture shows a populated room list: at least two rooms, one
     open and one in progress, created by other actors before the capture, not
     an empty list.
   - The auction capture comes from the responding bidder.
   - The purchase capture comes from the decider, plus one observer capture.
5. **Index.** `/srv/agents/evidence/TASK-vd-final-evidence/README.md` lists
   every pair (app | design frame | head | served version | nearest-frame
   label), the deviation list of the effort (the brief-vs-rules items, the
   room name and round counter, the progress bar, avatar artwork, the game
   duration and round count, the same-room restart, and the derived %
   column), and the commands to reproduce.
6. **Carry-overs** (from `/srv/agents/evidence/EFF-visual-design/final-evidence-carry-over.md`):
   - RVW-017: frame-specific error messages on the capture deadline breaks;
   - RVW-012: a unit assertion for one asset-card group-chip text.
7. **No product change.** No change under `apps/` or `packages/` except the
   one RVW-012 unit test. Spec and assertion text stay unchanged.

## Scope and non-goals

In scope: e2e capture calls and state setup for the captures,
`scripts/capture-design-frames.cjs` (RVW-017), the collector invocation, the
index, and one client unit test (RVW-012).

Not in scope: any visual fix. If a pair shows a defect, record it in the index
and report it to the Team Lead; do not fix it here.

## Dependencies

Base: main 92e4439. Runs alone.

## Escalation conditions

Ask the Team Lead before any of these:
- a screen that no existing flow reaches;
- a capture that stalls (check `free -m` / `uptime` first; the TL stops stale
  Docker stacks);
- any visual defect you find.

## Required workflow

Small evidence task: Explore -> Apply in the same context (the TL records why)
-> Verify -> PR -> start the independent review yourself -> review fixes ->
exact-head review.

Before every push, read all four CI jobs' failures. Before every review
request, run `agentctl task show TASK-vd-final-evidence`.

**Do not merge.** The Team Lead merges through pr-merge-gate.

## Required checks

- `pnpm test`, `pnpm typecheck:e2e`;
- `openspec validate --all --strict`;
- `git diff --check`;
- CI 4/4 on the PR head.

Run local browsers with one worker.

## Deliverables

- branch `agent/task-vd-final-evidence`, the PR and CI evidence;
- `/srv/agents/evidence/TASK-vd-final-evidence/` with the frames, the pairs,
  the manifests and the README index;
- the independent review report.

The Engineer accepts the exact revision before editing.
