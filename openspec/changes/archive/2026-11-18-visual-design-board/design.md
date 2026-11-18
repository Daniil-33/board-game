# Design

## Context

`BoardScene` already keys static cell construction by projected board contents. The ownership, housing and mortgage layers currently rebuild at each refresh. `GameScreen.vue` wires the board's asset-selection callback to the existing card. Browser tests locate the canvas through `board` and `board-canvas` and click based on the existing ring geometry.

The desktop reference is «Игровой экран» in `docs/design/ui-mvp-v1.html`. The mobile reference is «Mobile · Поле» in `docs/design/ui-mvp-mobile-v1.html`. The effort design defines the tokens, compact-cell content and view-only rendering. The Team Lead's response to TASK-vd-board supplies the fallback monogram source.

## Goals / Non-Goals

- Match the board content and visual hierarchy in both reference frames using the accepted theme.
- Keep marker refresh, animation playback and lazy texture loading independent of each other.
- Limit changes to the widget, shared theme and resolver, tests and client OpenSpec deltas. Page layout, asset card contents, dice UI, sound and authoritative game behavior are outside this change.

## Decisions

1. Read CSS tokens at mount through `pixi-theme.ts` and normalize solid colors, gradient stops and font families there. Build group strips with Pixi `FillGradient`. Use special cell surfaces and geometry from the references. Measure company labels using the active Pixi font, and switch visibility using the mounted board width so the CSS-scaled canvas, cell hit areas and labels remain aligned.
2. Resolve URLs from the active logo set with the cell surface appearance. Resolve monograms from the geometric manifest through the same shared module, with up to two letters from the catalog name when a known company has no manifest text. Keep the fallback tile visible while a texture is pending. Cache in-flight and resolved loads by URL and guard asynchronous completion against stale cells and teardown.
3. Keep one Pixi application and preserve the keyed cell tree. Derive per-cell owner, house and mortgage values from each view and update only markers whose display values change. Keep tokens keyed by player and use existing six-slot placement, including separate jail and visitor positions. Keep existing canvas and scene test hooks.
4. Keep the existing Pixi tap hit areas and asset-selection callback. Use a widget-owned desktop Tooltip anchored to the hovered cell's displayed rectangle. Clear it on pointer exit, view replacement, layout changes and teardown as applicable. Keep the tooltip anchor outside pointer hit testing so canvas click coordinates continue to work.
5. Use the existing event queue and scene clock. Restyle hop, jail jump and rent visuals in the scene and check the browser's reduced-motion preference when each effect plays. Preserve cancellation and Welcome snapping. Keep authoritative marker refresh and controls independent of animation completion.

## Risks / Trade-offs

- A compact cell offers roughly 30 CSS pixels. Verify logos, marker separation and tap targets at 360, 390 and 430 px, including a six-token stack.
- SVG texture loading and Pixi text measurement depend on the browser. Capture with fonts loaded and record the viewport, device profile, CPU throttle and movement frame-time sample. Compare a live board with matching designer frames at 1440×900 and 390×844.
