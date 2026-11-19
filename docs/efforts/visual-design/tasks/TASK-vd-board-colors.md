# Team Lead -> Engineer Task Handoff

```yaml
id: TASK-vd-board-colors
revision: 1
effort: EFF-visual-design
project: economic-board-game
source_commit: 68390a7 # main after TASK-vd-load-split (PR #97)
owner: team-lead
status: proposed
```

## Outcome

The Pixi board shows its group colour strips and its special-cell gradients
in production builds. On staging today every strip is grey and every
special cell is white.

## Defect (TL finding, 2026-11-18)

- `apps/client/src/shared/config/pixi-theme.ts` `boardTheme()` parses the
  gradient tokens with `/rgba?\([^)]*\)/g`. Two values are affected:
  `group(id)` reads `--group-*`, and `special(kind)` reads
  `--gradient-board-*`.
- The production CSS minifier rewrites `rgb(...)` as hex. Staging serves
  `--gradient-board-start:linear-gradient(135deg,#b9f5e1,#9ccbff)`.
- The regex therefore finds fewer than two colours, and `BoardCanvas` falls
  back to `theme.inset` (grey strips) and `theme.cell` (white corners).
- Evidence:
  - with colours (dev build): `/srv/agents/evidence/TASK-vd-board/live-desktop.png`;
  - without colours (production build):
    `/srv/agents/evidence/TASK-vd-e2e/screens/game-desktop-app.png` and
    `/srv/agents/evidence/TASK-vd-load-split/after-game.png`.

## Acceptance criteria

1. **Parsing.** The colour parsing accepts every CSS colour form the
   minifier can emit:
   - hex `#rgb`, `#rgba`, `#rrggbb` and `#rrggbbaa`;
   - `rgb()` and `rgba()`, with comma or space syntax;
   - named colours, if used.
   A small pure parser is preferred over regex guessing.
2. **Unit tests.** They cover every form above, plus the exact minified
   strings from the built CSS: both the `--group-*` and
   `--gradient-board-*` tokens.
3. **Build-level test.** A test fails if any `--group-*` or
   `--gradient-board-*` token in the built CSS yields fewer than two
   colours.
4. **Browser check.** A browser check on the production stack samples one
   group strip and one special corner. It asserts that they are not the
   fallback inset or cell colour. Use the multi-point sampling helper from
   TASK-vd-e2e if available, or an equivalent.
5. **Screenshots.** Desktop and mobile production-build board
   screenshots, next to `live-desktop.png` and the design frames.
6. **No other change.** No behaviour, layout or token value changes.

## Scope and non-goals

In scope:
- `shared/config/pixi-theme.ts` and its tests;
- a board-colour browser check;
- an OpenSpec change if the board spec needs a scenario.

Not in scope:
- other visual differences from the design;
- any token value change.

## Dependencies

Base: main 68390a7. Runs in parallel with TASK-vd-e2e. TASK-vd-e2e
regenerates its screenshot pairs after this fix merges.

## Required workflow

Explore -> Propose (OpenSpec change; `agentctl engineer report --wake`) ->
Team Lead approval -> Apply in a fresh context -> Verify -> PR -> start the
independent review yourself -> review fixes. Archive the OpenSpec change in
the PR once review passes.

## Required checks

- `pnpm build`, `pnpm test`, lint, `pnpm typecheck:e2e`;
- `openspec validate --all --strict`;
- `git diff --check <base> HEAD`;
- green CI (all four jobs) on the PR head;
- the bundle total stays at or below 343,863 B.

## Deliverables

- branch `agent/task-vd-board-colors`, the PR and CI evidence;
- the screenshots;
- the independent review report.

The Engineer accepts the exact revision before editing.
