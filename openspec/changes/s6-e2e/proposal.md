## Why

Stage 6 implementation and client surfaces are complete, but the effort still needs end-to-end evidence for the seven accepted scenarios and desktop/mobile app-to-design pairs before the Team Lead can close the effort.

## What Changes

- Add seven deterministic three-client browser scenarios for casino outcomes, chance payment/liquidation, final jail behavior, redemption locking, and server recovery.
- Capture current-head app screenshots for the casino dialog, chance card, jail choice, and jail status at desktop and mobile viewports; collect them with the existing frame and blank-image guards.
- Update the stage 6 `Сделано` roadmap entry with the implementation and e2e PRs.

## Capabilities

No spec-level behavior changes. The tests prove existing accepted behavior in `engine/special-cells`, `engine/mortgage`, `engine/turn-cycle`, `server/recovery`, and `client/special-cells`. The scenario-to-requirement mapping will be recorded in the PR body. No delta specs are needed because this change adds evidence and does not change those contracts.

## Impact

Only `e2e/`, test fixtures or seeded-stack setup if needed, visual-evidence capture/collection scripts, `ROADMAP.md`, and this OpenSpec change. Core, protocol, server runtime, and client product behavior remain out of scope. Existing stage 3–5 and stage6-client-smoke browser tests remain unchanged.
