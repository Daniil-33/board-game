# Design

## Context

See proposal.md for the reported defects and required behavior. The existing client renders stage 6 surfaces inside `.game-dialogs`, and `BoardCanvas` owns the PixiJS canvas and its resize observer. Prior candidate CSS changes corrected sheet geometry but retained the chance-loss transparency defect. The precise causal chain is not established yet; implementation must first isolate it and record reproducible evidence.

## Goals / Non-Goals

**Goals:**
- Preserve the current desktop presentation and keep mobile surfaces in the viewport.
- Correct the actual cause of the chance-loss board rendering defect.
- Keep the board at its existing logical size and render readiness contract.
- Keep stage 6 UI in the lazy game chunk and respect reduced motion.

**Non-Goals:**
- Change game rules, server or protocol behavior.
- Hide the blank region through board resizing, overlap, or longer screenshot waits.
- Change the approved desktop design.

## Decisions

- Establish causality before selecting a rendering fix. Compare the same chance-loss state with the reveal alone, charge alone, and both surfaces; inspect canvas dimensions, Pixi render invalidation, and DOM compositing. The resulting fix must target the proven source and cite its file and line in the PR body.
- Keep the reveal and charge in their current composition unless evidence shows that the accepted layout cannot meet the requirements within that structure. A move out of the board or another design change requires Team Lead review under the handoff.
- Add permanent browser coverage using the `sampleBoardCanvas` and `exerciseMobileLayouts` helpers from the handoff. For chance gain, chance loss plus charge, casino result, and casino decision, exercise direct 390x844, 1440x900-to-390x844, and 844x390-to-390x844 layouts; verify surface geometry, no horizontal scroll, all 40 sampled cell centres opaque, and at least as many distinct colours as the corresponding desktop state. Verify existing centring at 1440x900 and 1920x1080.
- If implementation changes JavaScript logic, add a focused client unit test for that logic.
- Compare gzip -9 size per JavaScript asset using the Team Lead's Node 22 `build:bundle` method at the base and head. Initial-route chunks must not grow; any game-chunk growth must come from this fix and be reported.

## Risks / Trade-offs

- [The board transparency may be caused by browser compositing rather than explicit renderer logic] → Use browser measurements and controlled state comparisons before changing code; do not infer the cause from CSS correlation alone.
- [Responsive resize and rotation may expose different invalidation paths] → Exercise all three mobile checkpoints for each required state.
- [Bundle output filenames may be content-hashed] → Compare normalized per-file gzip sizes and identify entry versus lazy game chunks using the Vite manifest.

## Migration Plan

No data or API migration. Ship the client fix through the assigned branch and PR after required checks and review.
