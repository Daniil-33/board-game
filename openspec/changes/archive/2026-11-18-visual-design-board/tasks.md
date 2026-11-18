# Tasks

## 1. Theme and asset cells

- [x] 1.1 Extend the shared logo resolver with the geometric monogram and catalog-name fallback. Unit-test both logo sets, light/dark URL selection and the missing monogram path. See `client/logos` · Resolve a fallback company monogram.
- [x] 1.2 Extend the Pixi theme adapter to expose the needed colors, group gradients and fonts. Verify the board uses these values and passes the hex lint. See `client/game-screen` · Generated board.
- [x] 1.3 Restyle the keyed cell tree, preserve CLASSIC_40 geometry and add lazy URL-cached textures and measured label visibility. Unit-test layout and missing/rejected logo fallback. See `client/game-screen` · Generated board.

## 2. Live board behavior

- [x] 2.1 Diff view-derived markers per asset and preserve stable token slots. Unit-test owner changes, one through four pips, mortgage transitions, shared cells and eliminated tokens. See `client/game-screen` · Projected owner markers, House markers, Mortgage cell markers and Generated board.
- [x] 2.2 Add desktop hover details and retain the pointer selection callback. Verify canvas coordinate interaction and the existing canvas and asset-card selectors. See `client/game-screen` · Asset inspection.
- [x] 2.3 Restyle movement and rent, preserve queue ordering and reload cancellation, and honor reduced motion. Exercise both motion preferences plus an authoritative snap during an animation. See `client/game-screen` · Animation follows events in order and Rent payment animation.

## 3. Evidence and delivery

- [x] 3.1 Verify 360, 390 and 430 px sizing and tap behavior. Save live and design screenshots at 1440×900 and 390×844 and a movement frame-time measurement with the emulated phone and CPU profile in `/srv/agents/evidence/TASK-vd-board/`.
- [x] 3.2 Run `pnpm build`, `pnpm test`, `pnpm --filter @game/client build:bundle`, `pnpm --filter @game/client lint`, `openspec validate --all --strict` and `git diff --check <base> HEAD`. Record bundle sizes and browser coverage.
- [x] 3.3 Open the task PR and request independent review for its exact head. Address findings and archive the change in the PR once review passes. Verify current-head review and all four CI jobs before handoff.
