# Team Lead -> Engineer Task Handoff

```yaml
id: TASK-vd-game-layout
revision: 1
effort: EFF-visual-design
project: economic-board-game
source_commit: TBD # main after TASK-vd-shell-pages (PR #84) and TASK-vd-board merge
owner: team-lead
status: proposed
```

## Outcome

The game page matches the owner's design on desktop and on phones. Every
existing in-game action stays reachable on both.

- **Desktop (≥ 1024 px):** three columns.
  - Left: the players panel.
  - Centre: the board with the turn header (current player, phase, timer,
    dice) and the event feed with chat in its middle.
  - Right: "Мой ход" (actions) and "Мои активы" (build, sell, mortgage,
    redeem).
- **Mobile (< 1024 px):** the board on top and the bottom navigation
  "Поле · Активы · Журнал · Ещё". "Ещё" holds resign, the rules summary,
  leave, and the slot for the sound controls.

The dialogs keep their current look and behavior here; they are restyled in
TASK-vd-game-dialogs.

## Acceptance criteria

1. **Layout** per `docs/design/ui-mvp-v1.html` "Игровой экран" and the mobile
   file "Поле", "Мои активы", "Журнал и чат" and "Ещё", with the breakpoints
   from design.md § "Breakpoints and layout":
   - side columns about 280 px from 1280 px, and about 240 px for
     1024-1279 px;
   - the board scales to the centre column;
   - no horizontal overflow at 360, 390, 768, 1024, 1440 and 1920 px (an
     automated check).
2. **Players panel** (`widgets/players-panel`). For each player:
   - name and avatar in their `--player-N` color (seat index from
     `view.players`, the same source the waiting room and setup use);
   - balance and capital through `Money`;
   - house count;
   - status badges (current turn, in debt, eliminated, disconnected) from
     the view only.

   The legacy `TOKEN_COLORS` must not be used. If TASK-vd-board has not
   already moved the in-game roster to `--player-N` (REV-vd-shell-7ad96ec
   RVW-005), this task does it.
3. **Turn header** (`widgets/turn-header`): current player, phase label,
   `Countdown` timer and dice per the design. It reuses the components that
   PR #84 restyled and does not fork them.
4. **"Мой ход"** (`widgets/my-turn` on top of `features/turn-actions`):
   - the primary gradient button for the current main action;
   - secondary and danger actions;
   - disabled controls show their reason as a Tooltip on desktop and as
     visible text on mobile;
   - the same commands and legality as today.
5. **"Мои активы"** (`widgets/my-assets`):
   - the owned assets grouped by color group with the group gradient, using
     the `-dark` logo file through `logoUrl` (dark surface) and the monogram
     fallback;
   - house pips and the mortgage state;
   - build, sell house, mortgage and redeem controls with the same legality
     adapters as today, and the reason when an action is disabled.
6. **Event feed with chat** (`widgets/event-feed`, `features/send-chat`):
   - entries from `entities/event/describe.ts` (icon, Russian text from the
     keys, actors, amounts) and chat messages in one list;
   - ordering: live items by arrival order, history items from `Welcome` by
     server `at` (REV-vd-chat-2 RVW-002);
   - the input enforces the server limits (1-300 characters, at most 4
     lines);
   - a `ChatAck` rejection shows its reason;
   - eliminated players and spectators who are members can write;
   - it auto-scrolls only when the viewer is already at the bottom;
   - it shows nothing the viewer's projection hides (no new data path: it
     uses the existing view and the history only).
7. **Toasts** (`shared/ui` Toast through an `app` provider): every rejected
   command shows the translated error reason. Toasts do not stack beyond 3.
8. **Reconnect banner** (`widgets/reconnect-banner`): shown while the
   socket is reconnecting, hidden after `Welcome`, and announced with
   `role="status"`.
9. **Mobile navigation** (`widgets/mobile-nav`): Reka `Tabs` as a bottom tab
   bar. The tab state survives a view update. The "Журнал" tab shows an
   unread-chat dot.
10. **No behavior change:** the same commands, legality and projections.
    Stage 1-5 browser specs keep passing on the `data-testid` hooks; add
    hooks for new elements.
11. **Tests:**
    - component tests for the players panel badges, the my-assets
      disabled-reason mapping, feed ordering (live vs history), the chat
      input limits and rejection, the toast cap, and the banner;
    - the no-overflow viewport check at the six widths;
    - i18n checks stay green (no raw text, no missing or unused keys).
12. **Bundle:** report the gzip JS and CSS per chunk against the merge base,
    with initial-route JS separate from lazily loaded chunks.
13. **Evidence:** screenshots of the game page at 1440x900 and 390x844 (all
    four mobile tabs) next to the design frames, in
    `/srv/agents/evidence/TASK-vd-game-layout/`.

## Scope and non-goals

In scope:
- `apps/client/src/pages/game/**`;
- the widgets players-panel, turn-header (layout only), my-turn, my-assets,
  event-feed, mobile-nav and reconnect-banner;
- `features/send-chat` and `features/turn-actions` presentation;
- the toast provider;
- locale keys;
- tests, e2e selectors, and the OpenSpec client delta.

Not in scope:
- purchase card, auction panel, asset card, rent panel, debt notices,
  elimination and game over: TASK-vd-game-dialogs. Keep their current
  components mounted and working;
- board rendering: TASK-vd-board;
- sound: TASK-vd-sound (leave the "Ещё" slot empty);
- any core, protocol or server change.

## Canonical references

- `docs/efforts/visual-design.md` revision 2, C3, C4, C7, C9 and C11.
- `docs/efforts/visual-design/design.md` § "Component inventory",
  "Breakpoints and layout", "Event log and chat", "Language and
  localization".
- Design files on main. Brief-vs-rules rule (owner, 2026-11-18): the
  current rules and functionality win, and styling follows the references.
  Record any gap in the PR body; do not change rules.

## Dependencies

Starts after `TASK-vd-shell-pages` (PR #84) and `TASK-vd-board` merge,
because they edit `GameScreen.vue`, `Hud.vue` and the roster colors. It runs
before TASK-vd-game-dialogs (same page).

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
- A design element that needs data the viewer's projection does not carry.

## Deliverables

- branch `agent/task-vd-game-layout`, the PR and CI evidence;
- screenshots and the bundle table;
- the independent review report.

The Engineer accepts the exact revision before editing.
