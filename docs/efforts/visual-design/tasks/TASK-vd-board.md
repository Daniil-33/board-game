# Team Lead -> Engineer Task Handoff

```yaml
id: TASK-vd-board
revision: 1
effort: EFF-visual-design
project: economic-board-game
source_commit: 436a12a # main after TASK-vd-tokens (PR #83)
owner: team-lead
status: proposed
```

## Outcome

The PixiJS board widget looks like the owner's design and stays readable on
phones. Cells show:
- the group gradient price strip;
- the brand logo, or the monogram fallback;
- owner markers in player colors, houses and the mortgage hatch;
- player tokens.

Movement and rent animations are restyled. Clicking or tapping a cell opens
its asset card.

## Acceptance criteria

1. **Theme.** All colors, gradients and fonts come from
   `shared/config/pixi-theme.ts` (TASK-vd-tokens). The board defines no
   color of its own, and the hex lint applies.
2. **Cells** per the design (`docs/design/ui-mvp-v1.html` "Игровой экран",
   mobile file "Поле"):
   - a group-gradient price strip using `FillGradient` (monopoly M1-M8,
     logistics, energy);
   - the logo from the resolver (`logoUrl(companyId, { dark })` from
     TASK-vd-logos-brand): the light file on light cells, the `-dark` file
     on dark surfaces;
   - the monogram (from the active set's manifest) on the group gradient
     when no logo URL exists or loading fails;
   - the name, shortened by measurement, and the price, formatted with
     `shared/lib/format`;
   - corners (Start, Jail, Casino, Go-to-jail) drawn per the design;
   - chance cells.
3. **Markers:**
   - the owner shown as a border or ribbon in the player color (six player
     tokens);
   - houses 1-4 as pips;
   - mortgage as a diagonal hatch plus dimming;
   - tokens stacked per cell.
   All of them render from the view only.
4. **Animations:**
   - token movement and the rent transfer, restyled;
   - never blocking state;
   - skipped on reload;
   - reduced motion respected (`prefers-reduced-motion` shortens or
     disables them).
5. **Mobile.**
   - At 360-430 px width the board fits the width.
   - Small cells show only the strip, the logo or monogram and the markers
     (no text).
   - Tapping a cell opens the asset card.
   - Desktop hover shows a Tooltip with the name and price.
6. **Performance.**
   - Logo textures load lazily and are cached per URL.
   - No re-creation of the 40 cells on every view update; only changed
     markers redraw.
   - Measure the frame time during a movement animation on a mid-range
     emulated phone profile and report it.
7. **Tests:**
   - unit tests for the layout and marker mapping (owner, houses,
     mortgage, tokens) from views;
   - fallback to the monogram;
   - dark/light logo selection;
   - the existing board and e2e selectors still pass (canvas test hooks
     kept).
8. **Evidence.** Screenshots at 1440x900 and 390x844 next to the design
   frames, in `/srv/agents/evidence/TASK-vd-board/`.

## Scope and non-goals

In scope: `apps/client/src/widgets/board/**`, `shared/config/pixi-theme.ts`
if it needs additions, tests, OpenSpec client delta.

Not in scope: the page layout around the board (`TASK-vd-game-layout`), the
asset card content (`TASK-vd-game-dialogs`; only the open-card intent is
emitted here), dice UI (`turn-header`), sound.

## Canonical references

- `docs/efforts/visual-design.md` revision 2, C5, C6 and C11.
- `docs/efforts/visual-design/design.md` § "Board rendering", "Logos",
  "Tokens and theming".
- Design files on main.

## Dependencies

Starts after `TASK-vd-tokens` merges. It runs in parallel with
`TASK-vd-shell-pages`.

## Required workflow

Explore -> Propose (OpenSpec change; `agentctl engineer report --wake`) ->
Team Lead approval -> Apply in a fresh context -> Verify -> PR -> start the
independent review yourself -> review fixes. Archive the OpenSpec change in
the PR once review passes.

## Required checks

- `pnpm build`, `pnpm test`, the client bundle and lint;
- `openspec validate --all --strict`;
- `git diff --check <base> HEAD`;
- green CI (all four jobs) on the PR head.

## Escalation conditions

- An owner-visible choice the designs leave open. Include a screenshot of
  the options.
- Readability at 360 px that the design cannot meet.

## Deliverables

- branch `agent/task-vd-board`, the PR and CI evidence;
- screenshots and the frame-time measurement;
- the independent review report.

The Engineer accepts the exact revision before editing.
