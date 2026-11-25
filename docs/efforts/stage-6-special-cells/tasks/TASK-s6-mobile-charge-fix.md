# Team Lead -> Engineer Task Handoff

```yaml
id: TASK-s6-mobile-charge-fix
revision: 1
effort: EFF-stage-6-special-cells
project: economic-board-game
source_commit: ba573c3 # main; rebase on current main before the PR
owner: team-lead
status: proposed
```

## Outcome

On mobile (below 1024px), the stage 6 reveal and bank-charge surfaces render correctly, and the board stays fully drawn behind them. This fixes two defects found by TASK-s6-e2e (PR #122, review findings RVW-002 and RVW-007). Both are live on staging since PR #120:

1. **Sheet off-screen.** The chance reveal and the bank-charge sheet render shifted about 195px off the left edge at 390px wide. This happens on a direct open, after a desktop→mobile resize, and after a landscape→portrait rotation.
   - Cause: `apps/client/src/pages/game/GameScreen.vue:292` applies the desktop centring `transform: translate(-50%, -50%)` whenever `special-event-reveal` is present. The mobile sheet rules (`@media (max-width:1023px)`, around :300-310) do not reset it.
2. **Board partly blank.** In the chance-loss + bank-charge state only, the board canvas is partly blank when the sheet sits at its correct mobile position: 31/40 cell-centre samples opaque, samples 18-26 transparent, a black region above the sheet. Chance gain, casino result and casino decision draw fully (40/40). Two CSS-only fixes for (1), `transform: translate(0,0)` and scoping the desktop rule to `min-width:1024px`, both fix the position but NOT this.

## Acceptance criteria

1. For each mobile state (chance gain; chance loss + bank charge; casino result; casino decision), at 390x844, after (a) a direct open, (b) a 1440x900→390x844 resize and (c) an 844x390→390x844 rotation:
   - the sheet or reveal box is inside the viewport: x ≥ 0, right ≤ 390, no horizontal page scroll;
   - the board canvas is fully drawn: after board-ready plus 2 rAF, 40/40 sampled cell centres are opaque, with no fewer distinct colours than the same state at 1440x900.
2. At 1440x900 and 1920x1080, every stage-6 reveal and dialog keeps its current desktop centring and appearance.
3. **Root cause of defect (2):** find and fix the actual cause, with file:line, in the PR body. Leads to check:
   - whether the board renderer clears or masks a region for the centred reveal or banner that becomes visible when the reveal moves into the mobile sheet;
   - whether the board container is resized when the sheet opens and the canvas isn't re-rendered;
   - whether the reveal's own background is transparent over the board.

   It is not acceptable to hide the symptom by sizing, overlap or a capture wait.
4. **Tests.** Permanent browser assertions for 1 and 2. Reuse the TASK-s6-e2e helpers (`sampleBoardCanvas`, `exerciseMobileLayouts` and the seed-4 `chance-liquidation` reproduction) described in `/srv/agents/evidence/TASK-s6-e2e/handover-to-mobile-charge-fix.md`, copying them into this PR as needed. Add a client unit test for any JS logic you change.
5. **Bundle.** TL method (node:22, `build:bundle`, per-file gzip -9 over `apps/client/dist/assets/*.js`), with the baseline at your base and the head. Initial-route chunks must not grow. The lazy game chunk may grow only by the fix itself; report the delta.
6. **Checks.** `pnpm build`, `pnpm test`, client lint, `openspec validate --all --strict`, CI 4/4 on the exact head, and the stage 3-5, load-split and stage6-client-smoke suites green.

## Scope and non-goals

In scope:
- `apps/client`: `GameScreen.vue`, the special-cells widgets, `BoardCanvas` and board layout, as the root cause requires;
- tests;
- an OpenSpec delta to the canonical `client/special-cells` spec if the mobile layout requirement needs tightening.

Not in scope:
- core, protocol or server;
- the TASK-s6-e2e completion scenarios (PR #122 resumes after this merges);
- other visual-design follow-ups.

## Canonical references

- Handoff C17 (mobile 390x844 works; desktop has no page scroll).
- `docs/efforts/stage-6-special-cells/design.md` § "Client".
- The PR #120 client surfaces and test ids.
- Evidence: `/srv/agents/evidence/TASK-s6-e2e/RVW007-investigation.md`, `/srv/agents/evidence/TASK-s6-e2e/RVW007-candidates.md`, and the screenshots under `/srv/agents/evidence/TASK-s6-e2e/`.

## Constraints and invariants

- Keep the PR #112 layout rules and the CTO chunk condition (stage-6 UI only in the lazy game chunk).
- Respect `prefers-reduced-motion`.
- **Records rule (CTO):** handoffs, archived OpenSpec changes and earlier briefs change only by a new revision. The PR body includes `git diff <your base> HEAD -- docs/efforts openspec/changes/archive ':(exclude,glob)openspec/changes/archive/*-s6-mobile-charge-fix/**'` with an empty output.

## Dependencies

- Upstream: main with #120.
- Downstream: TASK-s6-e2e (PR #122) rebases on this merge and re-runs its assertions.

## Delegated decisions

The Engineer decides:
- the fix technique;
- test structure.

Return to the TL:
- a fix that needs a design change (e.g. moving the reveal out of the board on mobile);
- any change to desktop appearance;
- bundle growth beyond the fix.

## Required workflow

1. Explore (reproduce both defects first).
2. Propose the OpenSpec change `s6-mobile-charge-fix`.
3. Apply in a fresh context after TL approval.
4. Verify.
5. Open the PR.
6. Independent review; the request requires the full 40-char head SHA.
7. Review fixes.

Archive before the exact-head review. **Do not merge.**

## Required checks

Criteria 1-6. The PR body includes:
- the root cause with file:line;
- before/after screenshots and pixel or geometry JSON for all four states and three checkpoints;
- the bundle table;
- the records diff.

## Escalation conditions

Escalate to the TL if:
- the root cause is outside the client;
- the fix requires changing the accepted design;
- a stage 3-5 browser test must change.

## Deliverables

- The branch `agent/task-s6-mobile-charge-fix` and its PR.
- Evidence in `/srv/agents/evidence/TASK-s6-mobile-charge-fix/`.
- The independent review report.
- Residual risks.
