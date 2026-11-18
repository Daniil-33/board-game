# Tasks

## 1. Dialog and decision surfaces

- [x] 1.1 Extend shared `ResponsiveDialog` and implement the purchase card with desktop dialog/mobile sheet, logo fallback, rent preview, existing purchase actions, disabled reasons, timer, and focus behavior; verify component states and `data-testid` coverage.
- [x] 1.2 Implement the auction desktop inline/mobile sheet presentation, seat-colored leader and low-timer state while preserving bid legality; verify leader, outbid, timer-low, and responsive component states.
- [x] 1.3 Implement responsive asset inspection from board and “Мои активы”, including full helper-backed rent table, mortgage state, ownership-only controls, and return focus; verify owner/other states and view updates.

## 2. Rent, debt, and terminal surfaces

- [x] 2.1 Complete rent shortfall and manual mortgage/sell entry points and liquidation summaries from projected data; verify shortfall/no-shortfall and liquidation asset amounts.
- [x] 2.2 Implement elimination and game-over design states, standings and exit actions while retaining eliminated-player chat; verify component states and spectator chat behavior.
- [x] 2.3 Refresh the board tooltip mortgage suffix as views change under a stationary pointer; add tooltip text tests and the “Asset inspection” → “Desktop hover” scenario.

## 3. Accessibility and integration evidence

- [x] 3.1 Verify focus trap, Escape policy, focus return, `aria-modal="true"`, and outside-focus redirection for dialogs and sheets; component tests SHALL state which surfaces are dismissable.
- [x] 3.2 Run required build, test, lint, OpenSpec, and diff checks; preserve stage 1–5 browser selectors and record results.
- [x] 3.3 Capture every surface at 1440x900 and 390x844 beside the design frames in `/srv/agents/evidence/TASK-vd-game-dialogs/`, and record per-chunk JS/CSS gzip sizes against the merge base with initial-route JS separate from lazy chunks.

## Workflow follow-up

- Open/update the feature PR, record and verify the external operation through `agentctl`, and start the independent review.
- Resolve valid review findings and archive the OpenSpec change after review passes.
