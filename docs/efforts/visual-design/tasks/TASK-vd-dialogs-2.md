# Team Lead -> Engineer Task Handoff

```yaml
id: TASK-vd-dialogs-2
revision: 1
effort: EFF-visual-design
project: economic-board-game
source_commit: <main after TASK-vd-evidence-frames merges>
owner: team-lead
status: proposed
```

## Outcome

The game dialogs and decision panels match their design frames (handoff
criterion 3), and the product name is the same on every screen. Where a game
rule or a projection limit forces a difference, it is listed, not hidden.

## Gaps (TL side-by-side review, 2026-11-19, with the fixed design frames)

Design frames: `/srv/agents/evidence/TASK-vd-evidence-frames/design-frames/`.
Current app captures: `/srv/agents/evidence/TASK-vd-toast-copy/screens/` and
`/srv/agents/evidence/TASK-vd-evidence-frames/auction-desktop-app.png`.

| Surface | Design frame | Today |
| --- | --- | --- |
| Purchase | desktop-04, mobile-06 | Generic dialog with a rent table and two plain buttons. The design has: a gradient header with the logo tile; category and group size; price and base-rent tiles; who owns the rest of the group; the balance after purchase; a primary "Купить за N" button with a secondary "На аукцион"; and the note about what happens on timeout. |
| Auction | desktop-06, mobile-07 | A key/value table below the board. The design has: a large current bid with start and step; the leader; a response queue with each player's state; a response timer bar; large Raise and Pass buttons; and the note that a pass is irrevocable. |
| Asset card | desktop-05, mobile-04 | A key/value list and a plain rent table. The design has: a logo header with category and price; chips for the other assets in the group, with owners and houses; a rent table with % of price that highlights the current tier; house-cost and mortgage tiles; and styled build/sell/mortgage buttons, each with its reason. |
| Rent and debts | desktop-09 | No rent card. The design has: a rent card (payer, amount, payee, shortfall, mortgage-or-sell options) and the automatic-liquidation summary. |
| Elimination | desktop-09 (right) | Check against the frame. |
| Game over | desktop-10 | Title shown twice and plain text lists. The design has: a winner hero with avatar and final balance; an elimination table (place, avatar, reason, balance); and the actions. |
| Jail, casino, chance | desktop-08 | Check against the frame. |
| Product name | lobby desktop-02 | Shell pages say "Настольная игра". TASK-vd-game-layout-2 adds "Economic Board Game" to the game top bar. Use one product name on login, lobby, room and game. |

## Acceptance criteria

1. **Match the frames.** Each surface above matches its frame in structure,
   hierarchy and the token-based styling. That covers headers, tiles, tables,
   queues, timer bars and button emphasis, at desktop and at 390x844 where a
   mobile frame exists.
2. **Rules and projection win.** Show only data the projection supplies.
   Every designed element that cannot be supplied is listed in the PR as a
   deviation, in the same form as the effort's five brief-vs-rules items.
   For example: the game-over duration or round count, "Новая партия в этой
   комнате" if no rule exists, or rent paid automatically if that is the
   rule. No protocol, server or game-core change.
3. **Behaviour unchanged.** No change to commands, legality or timing. All
   existing test ids stay, and all browser specs pass.
4. **Product name.** One product name across the shell and game screens.
   Use the TASK-vd-game-layout-2 top bar's name.
5. **Tests.** Component tests cover:
   - the new structure of each dialog: key elements present, the reason
     texts, the current rent tier highlighted;
   - the auction queue states.
6. **JS budget.** Report the gzip delta in every report. Stop and ask the
   TL if the delta exceeds +4 KB; the effort has about 6 KB left after
   TASK-vd-game-layout-2.
7. **Screenshots.** Capture each surface at both viewports with the
   committed producer, into `/srv/agents/evidence/TASK-vd-dialogs-2/`,
   with head and served version recorded. Put each one next to its frame
   in an index.

## Scope and non-goals

In scope: the widgets `purchase-card`, `auction-panel`, `asset-card`,
`rent-panel`, `debt-notices`, `elimination` and the game-over view; the
shell headers (product name); i18n; component tests; an OpenSpec delta for
`client/game-screen` if requirements change.

Not in scope:
- the game page layout, top bar, turn header, my-turn panel and board centre
  (TASK-vd-game-layout-2);
- protocol, server and game-core;
- token values;
- the collector and capture scripts.

## Dependencies

Base: main after TASK-vd-evidence-frames merges. Runs in parallel with
TASK-vd-game-layout-2. Both touch the locale files: whoever merges second
rebases.

## Escalation conditions

Ask the Team Lead before any of these:
- a designed element that would need new data;
- a frame whose intent is unclear;
- a budget overrun.

## Required workflow

Explore -> Propose (an OpenSpec change with the deviation list;
`agentctl engineer report --wake`) -> Team Lead approval -> Apply in a fresh
context -> Verify -> PR -> start the independent review yourself -> review
fixes -> archive -> exact-head review.

**Do not merge.** The Team Lead merges through pr-merge-gate. Run
`agentctl task show TASK-vd-dialogs-2` before you request each review, and
apply any TL note there.

## Required checks

- `pnpm build`, `pnpm test`, client lint, `pnpm typecheck:e2e`;
- `openspec validate --all --strict`;
- `git diff --check`;
- CI 4/4 on the PR head;
- bundle total at or below 343,863 B gzip.

Run heavy suites one at a time, with one Playwright worker.

## Deliverables

- branch `agent/task-vd-dialogs-2`, the PR and CI evidence;
- the screenshots with their index and the deviation list;
- the independent review report.

The Engineer accepts the exact revision before editing.
