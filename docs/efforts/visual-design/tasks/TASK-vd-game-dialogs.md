# Team Lead -> Engineer Task Handoff

```yaml
id: TASK-vd-game-dialogs
revision: 1
effort: EFF-visual-design
project: economic-board-game
source_commit: TBD # main after TASK-vd-game-layout merges
owner: team-lead
status: proposed
```

## Outcome

Every in-game decision surface matches the owner's design on desktop and on
phones:
- the purchase card;
- the auction panel;
- the asset card with its rent table;
- rent payment with the shortfall hint and manual mortgage;
- debt notices and the liquidation summary;
- the elimination screen;
- the game-over screen.

On desktop they are dialogs or inline panels. On mobile, purchase and
auction are bottom sheets. Rules, commands and timers are unchanged.

## Acceptance criteria

1. **Purchase card** (`widgets/purchase-card`). It uses `ResponsiveDialog`:
   a `Dialog` on desktop and a `Sheet` on mobile. It shows:
   - the group gradient header, the logo through `logoUrl` (monogram
     fallback), the name and the price;
   - the rent table preview;
   - the buy and decline actions with their disabled reasons;
   - the response countdown.
2. **Auction panel** (`widgets/auction-panel`). It is inline in the desktop
   centre column per the design and a `Sheet` on mobile. It shows:
   - the asset, the current bid and leader in their `--player-N` color;
   - the bid controls with the same increments and legality as today;
   - pass;
   - the response timer with a visible last-seconds state.
3. **Asset card** (`widgets/asset-card`). It opens from a board cell (the
   TASK-vd-board open-card intent) and from "Мои активы". It shows:
   - the owner, houses and mortgage state;
   - the full rent table from the core helpers, with the current tier
     highlighted;
   - the build, sell, mortgage and redeem actions only when the viewer owns
     the asset, using the existing legality adapters.
4. **Rent and debt** (`widgets/rent-panel`, `widgets/debt-notices`):
   - the amount due and the creditor;
   - the shortfall hint with the amount missing;
   - manual mortgage and sell entry points;
   - the liquidation summary listing the sold or mortgaged assets and their
     amounts from the view.
5. **Elimination and game over** (`widgets/elimination`,
   `pages/game-over`). They follow the design frames: final standings from
   the view, and leave or back-to-lobby actions. An eliminated player can
   keep watching and can still use chat.
6. **Accessibility:**
   - focus trap, Esc and focus return work on every dialog and sheet;
   - Esc does not dismiss a surface that the rules require an answer for.
     It keeps today's behavior, and a test states which surfaces are
     dismissable;
   - add the deferred REV-vd-tokens-2 RVW-006 assertion: an open dialog sets
     `aria-modal="true"` and a focus attempt outside the content is returned
     inside (not only the Tab/Shift+Tab wrap).
7. **No behavior change:** the same commands, timers, amounts and legality.
   All numbers come from the view and the game-core helpers, never from the
   design's illustrative numbers. Stage 1-5 browser specs keep passing on
   `data-testid` hooks.
8. **Tests:**
   - component tests for each surface's states: purchase affordable or not,
     auction leader/outbid/timer-low, asset card owner vs other, rent with
     and without shortfall, liquidation summary, elimination, game over;
   - the accessibility assertions above;
   - i18n checks stay green.
9. **Bundle:** report the gzip JS and CSS per chunk against the merge base,
   with initial-route JS separate from lazily loaded chunks.
10. **Evidence:** screenshots of every surface at 1440x900 and 390x844 next
    to the design frames, in `/srv/agents/evidence/TASK-vd-game-dialogs/`.
    Staging is the place to check that the rendered logos show (the logo
    resolver gets its first consumers in the board task and in this task).

## Scope and non-goals

In scope:
- the widgets purchase-card, auction-panel, asset-card, rent-panel,
  debt-notices and elimination, and `pages/game-over`;
- `shared/ui` additions they need;
- locale keys;
- tests, e2e selectors, and the OpenSpec client delta.

Not in scope:
- the page layout and the panels: TASK-vd-game-layout;
- the board: TASK-vd-board;
- sound: TASK-vd-sound;
- stage 6-7 UI (casino, chance, final jail, trades);
- any core, protocol or server change.

## Canonical references

- `docs/efforts/visual-design.md` revision 2, C3, C4, C9 and C11.
- `docs/efforts/visual-design/design.md` § "Component inventory",
  "Breakpoints and layout", "Logos".
- Design files on main. Brief-vs-rules rule (owner, 2026-11-18): the rules
  win. Record any gap in the PR body.

## Dependencies

Starts after `TASK-vd-game-layout` merges (same page).

## Required workflow

Explore -> Propose (OpenSpec change; `agentctl engineer report --wake`) ->
Team Lead approval -> Apply in a fresh context -> Verify -> PR -> start the
independent review yourself -> review fixes. Archive the OpenSpec change in
the PR once review passes.

## Required checks

- `pnpm build`, `pnpm test`, lint (hex, boundary, i18n);
- `openspec validate --all --strict`;
- `git diff --check <base> HEAD`;
- green CI (all four jobs) on the PR head.

## Escalation conditions

- An owner-visible choice the designs leave open. Include a screenshot of
  the options.
- A design element that conflicts with a rule or needs data the projection
  does not carry.

## Deliverables

- branch `agent/task-vd-game-dialogs`, the PR and CI evidence;
- screenshots and the bundle table;
- the independent review report.

The Engineer accepts the exact revision before editing.
