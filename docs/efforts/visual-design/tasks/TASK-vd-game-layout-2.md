# Team Lead -> Engineer Task Handoff

```yaml
id: TASK-vd-game-layout-2
revision: 1
effort: EFF-visual-design
project: economic-board-game
source_commit: 5309f62 # main after TASK-vd-toast-copy (PR #102)
owner: team-lead
status: proposed
```

## Outcome

The desktop game screen at 1440x900 matches the game-screen design frame
(`docs/design/ui-mvp-v1.html`, frame "Игровой экран"), as handoff criterion 3
requires. Count strings use correct Russian plural forms.

This task answers CTO gaps G2, G3 and the centre-caption part of G4
(2026-11-19, effort-complete returned).

## Gaps to close (compare `/srv/agents/evidence/TASK-vd-toast-copy/screens/game-desktop-app.png` with `game-desktop-design.png`)

- **G2a.** Turn, phase, timer and dice sit in a separate card above the
  board. In the design they are in the board centre, together with the
  journal and chat.
- **G2b.** The design's top bar is missing. It holds the product name
  "Economic Board Game", the room, the round and player count, the
  connection status and a settings gear. Today the app shows
  "Настольная игра  Player 1".
- **G2c.** A full-width "Громкость звука" slider and "Выключить звук"
  ("Volume" and "Mute") sit in the main game area. In the design they
  belong behind the settings control.
- **G2d.** "Мой ход" shows "Бросить кость", "Бросить кости" and
  "Завершить ход" together, all disabled. The design shows the applicable
  primary action, and gives the reason for an unavailable one (for
  example "Кости уже брошены в этом ходу", "Dice already rolled this
  turn").
- **G2e.** At 1440x900 the board is cropped at the bottom edge.
- **G3.** `rent_tier_houses` "{houses} домов" renders "1 домов",
  "2 домов". Use proper Russian plurals: 1 дом, 2-4 дома, 5+ домов.
- **G4 caption.** During an auction the board centre still says
  "Player 3 бросает кости". The centre caption must follow the phase.

## Acceptance criteria

1. **Board centre (G2a).** At desktop widths the board centre holds:
   - the turn header (current player, phase, timer with progress);
   - the dice and the last roll;
   - the journal-and-chat panel.
   No separate turn card above the board. Mobile layout and navigation are
   unchanged, unless a shared component forces a change; then show it in
   the screenshots.
2. **Top bar (G2b).** A desktop top bar shows:
   - the product name;
   - the room;
   - the player count;
   - the connection status;
   - a settings control.
   Any element that the projection cannot supply exactly is omitted, not
   invented, and listed in the PR as a deviation with its reason. For
   example: the rooms table has no name, only an id and a code, and there
   is no game-round counter. No protocol or server change.
3. **Settings (G2c).** Sound volume and mute move behind the settings
   control: a popover or dialog built with Reka primitives. They keep
   their test ids and behaviour.
4. **My turn (G2d).** The panel shows only the actions that exist in the
   current phase:
   - the one currently applicable action is primary;
   - a phase action that is unavailable right now stays visible, disabled,
     with its reason text, as in the design;
   - actions of other phases, such as the single-die turn-order roll
     during a normal turn, are not shown.
5. **No cropping (G2e).** At 1440x900 the whole board, including its
   bottom row, is visible without page scroll.
6. **Plurals (G3).**
   - Every count string in `ru.json` uses ICU or vue-i18n plural forms:
     `rent_tier_houses` and a sweep of all other "{n} …" count strings.
   - `en.json` keeps its own correct forms.
   - A unit test covers 1, 2 and 5 (and 11 and 21 for Russian).
7. **Centre caption (G4).** The board-centre caption follows the phase:
   turn-order roll, regular roll, purchase decision, auction, rent and
   debt, game over. A unit test covers at least the auction phase.
8. **Deviations.** Where a rule or projection limit forces a difference
   from the design, list it in the PR body in the same form as the
   effort's five brief-vs-rules items. Everything else matches the design.
9. **Screenshots.** Provide `game-desktop` at 1440x900, plus mobile board,
   purchase and auction at 390x844, captured with the committed producer
   (`E2E_SCREEN_EVIDENCE=1`) at the PR head. Write them to
   `/srv/agents/evidence/TASK-vd-game-layout-2/`, never into another
   task's folder. Each capture records its head and the served
   `/version.txt`.
10. **Tests stay green.** All existing browser specs pass. Update a selector
    only where the layout move requires it, and keep the test ids.

## Scope and non-goals

In scope:
- the game page layout;
- `widgets/turn-header`, `my-turn`, `board` (centre content only),
  `event-feed`, the reconnect banner placement;
- a new top bar widget and the settings popover;
- the i18n locales and their tests;
- an OpenSpec delta for `client/game-screen`.

Not in scope:
- any protocol, server or game-core change;
- token values;
- logo files;
- the screenshot collector and design-frame capture (TASK-vd-evidence-frames).

## Dependencies

Base: main 5309f62. Runs in parallel with TASK-vd-evidence-frames, which
edits only `scripts/` and e2e capture code. Coordinate through the Team Lead
if you need to touch `scripts/collect-visual-screens.mjs` or
`scripts/capture-design-frames.cjs`.

## Escalation conditions

Ask the Team Lead before any of these:
- a top-bar or turn-panel element that would need new projection data;
- a layout that cannot fit 1440x900 without dropping a designed element;
- any wording that changes a game rule's meaning.

## Required workflow

Explore -> Propose (an OpenSpec change listing the deviations;
`agentctl engineer report --wake`) -> Team Lead approval -> Apply in a fresh
context -> Verify -> PR -> start the independent review yourself -> review
fixes -> archive the OpenSpec change in the PR -> exact-head review of the
archived head.

**Do not merge.** The Team Lead merges through pr-merge-gate after accepting
the exact head. Check the task history (`agentctl task show`) before you
request each review.

## Required checks

- `pnpm build`, `pnpm test`, client lint, `pnpm typecheck:e2e`;
- `openspec validate --all --strict`;
- `git diff --check <base> HEAD`;
- green CI (all four jobs) on the PR head;
- the bundle total stays at or below 343,863 B gzip.

Run heavy suites one at a time: the host has 7.7 GB and may run a second
Engineer.

## Deliverables

- branch `agent/task-vd-game-layout-2`, the PR and CI evidence;
- the screenshots and the deviation list;
- the independent review report.

The Engineer accepts the exact revision before editing.
