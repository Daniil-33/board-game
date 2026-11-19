# Team Lead -> Engineer Task Handoff

```yaml
id: TASK-vd-evidence-frames
revision: 1
effort: EFF-visual-design
project: economic-board-game
source_commit: 5309f62 # main after TASK-vd-toast-copy (PR #102)
owner: team-lead
status: proposed
```

## Outcome

Every design frame used as evidence is a real render of the design export.
The collector refuses blank or near-uniform frames, so a blank frame can no
longer pass. The desktop auction pair shows a real auction panel.

This task answers CTO gaps G1 and the evidence part of G4 (2026-11-19).

## Defect (CTO G1, confirmed by the TL)

- 7 of the 18 frames in
  `/srv/agents/evidence/TASK-vd-e2e/screens/captured-design-frames/` are
  blank white images of 2.4-5.9 KB:
  - desktop-02 лобби, desktop-04 покупка, desktop-06 аукцион,
    desktop-08 тюрьма, desktop-10 итоги;
  - mobile-03 поле, mobile-07 аукцион.
- They feed 12 of the 35 pairs.
- `scripts/capture-design-frames.cjs` screenshots each `<iframe>` as soon as
  it is visible. The exports are bundler pages whose iframes start as
  `about:blank#<uuid>` and are filled by the page's script after load. Later
  frames are captured before their content renders.
- The desktop auction app capture (`auction-desktop-app.png`) shows phase
  "Аукцион" with no auction panel, because it was taken from a viewer who is
  not the responding bidder.

## Acceptance criteria

1. **Frame capture.** `capture-design-frames.cjs` waits for each iframe's
   document to be filled and rendered before the screenshot. That means
   waiting for content in the frame (body has rendered children, fonts
   ready, images decoded), not a fixed sleep. All 18 frames come out
   non-blank.
2. **Blank-frame guard.** The capture script and
   `collect-visual-screens.mjs` both fail on a blank or near-uniform image,
   app or design. Use a pixel-variance check (for example, the luminance
   standard deviation below a threshold) plus a minimum distinct-colour
   count. The thresholds are documented, and a test proves:
   - a white PNG and a single-colour PNG fail;
   - every one of the 18 recaptured frames passes.
3. **Desktop auction.** The desktop auction app capture comes from the
   responding bidder, with the auction panel visible. Add an env-gated
   `captureScreens` call at that point in the existing stage 3 flow. Do
   not change the flow's assertions or waits.
4. **Recapture now.**
   - Recapture all 18 design frames into
     `/srv/agents/evidence/TASK-vd-evidence-frames/design-frames/`.
   - Capture the desktop auction pair into
     `/srv/agents/evidence/TASK-vd-evidence-frames/`.
   - The full 35-pair recapture happens later, in TASK-vd-final-evidence,
     after TASK-vd-game-layout-2 merges.
5. **Evidence acceptance step.** `scripts/README.md` documents the guard
   and the order of steps: capture frames, capture the app, collect. The
   collector exits non-zero on any blank image.

## Scope and non-goals

In scope:
- `scripts/capture-design-frames.cjs` and `scripts/collect-visual-screens.mjs`;
- a small pure image-statistics helper and its test;
- the env-gated capture call in `e2e/stage3.spec.ts`;
- `scripts/README.md`.

Not in scope:
- any product code under `apps/` or `packages/` (TASK-vd-game-layout-2 owns
  the client);
- changing e2e assertions, waits or helpers;
- the 35-pair recapture.

## Dependencies

Base: main 5309f62. Runs in parallel with TASK-vd-game-layout-2.

## Escalation conditions

Ask the Team Lead before any of these:
- a frame that stays blank after a content-based wait;
- a need to touch e2e helpers or product code.

## Required workflow

Small, test-and-script-only task: Explore -> Apply in the same context (the
TL records why) -> Verify -> PR -> start the independent review yourself ->
review fixes -> exact-head review.

**Do not merge.** The Team Lead merges through pr-merge-gate after accepting
the exact head. Check the task history (`agentctl task show`) before you
request each review.

## Required checks

- `pnpm test`, `pnpm typecheck:e2e`, lint for the changed scripts;
- `openspec validate --all --strict` (no spec change expected);
- `git diff --check <base> HEAD`;
- green CI (all four jobs) on the PR head.

Local browser runs: only the design-frame capture and the one stage 3
capture, with one worker. The host has 7.7 GB and may run a second Engineer.

## Deliverables

- branch `agent/task-vd-evidence-frames`, the PR and CI evidence;
- the 18 frames, the desktop auction pair, and the guard test output;
- the independent review report.

The Engineer accepts the exact revision before editing.
