# CTO -> Team Lead Effort Handoff

```yaml
id: EFF-visual-design
revision: 1
project: economic-board-game
repo: github.com/Daniil-33/board-game
created_at: 2026-11-17T11:50:00Z
source_commit: e1bf4b2 # plus the docs PR that adds this file
owner: cto
status: proposed
```

## Outcome

The web client looks and works like the owner's design on desktop and on
phones. Every existing screen (stages 1-5) moves to the design system, and
the client is restructured so stages 6-7 build their UI directly in the new
style. The owner decided (2026-11-17) that this effort runs right after stage 5
and before stages 6-7. It changes no game rule.

## Expected behavior and acceptance criteria

Sources: `docs/design/ui-mvp-v1.html` (desktop), `docs/design/ui-mvp-mobile-v1.html`
(mobile), `docs/design/ui-brief.md` (screens and the owner's style decisions),
ROADMAP.md section "Визуальный дизайн" and "Технические решения". The numbers
in the designs are illustrative: every amount shown in the UI comes from the
projection and the core rules.

1. **Architecture and stack (owner decisions):**
   - `apps/client` is restructured by Feature-Sliced Design (layers `app`,
     `pages`, `widgets`, `features`, `entities`, `shared`).
   - The PixiJS board is one widget.
   - Tailwind CSS carries the design tokens; Reka UI (headless) carries
     dialogs, popovers, tooltips, tabs and sheets. No Vuetify.
   - Vue 3 stays.
   - The restructure keeps behavior identical and is a separate first step
     that is reviewed on its own.
2. **Design system.** The tokens of the design's "Дизайн-система и токены"
   section are defined once and used everywhere:
   - accent and semantic colors, action/auction/casino/chance gradients;
   - group gradients M1-M8, logistics and energy;
   - six player colors;
   - typography: Unbounded for headings and large numbers, Inter for the
     interface, tabular numbers for money and timers. Both fonts are
     self-hosted (OFL), not loaded from Google at run time.
3. **Desktop screens per design:**
   - login;
   - lobby: room list with statuses, create room, join by code, a
     "Войти / профиль" placeholder;
   - waiting room: seats, invite link and code, start and leave;
   - turn-order roll;
   - the game screen in three columns:
     - left: players with balance, capital, houses and status badges;
     - centre: the board, with the current turn, phase, timer, dice and the
       log and chat in its middle;
     - right: "Мой ход" with actions and "Мои активы" with build, sell and
       mortgage controls;
   - purchase card, auction panel, asset card with the rent table;
   - rent payment with the shortfall hint and manual mortgage;
   - liquidation summary, the elimination screen, the game-over screen;
   - toasts for rejected actions, the reconnect banner.
4. **Mobile per the mobile design** at phone widths (about 360-430 px):
   - lobby, room, board, "Мои активы" and "Журнал и чат" screens;
   - bottom navigation "Поле · Активы · Журнал · Ещё";
   - purchase and auction as bottom sheets.
   Every action available on desktop is reachable on mobile.
5. **Board** (PixiJS), restyled to the design:
   - cells with the group gradient price strip and a logo slot;
   - corners;
   - owner markers in player colors, houses, the mortgage hatch;
   - player tokens, dice;
   - movement and rent transfer animations.
   The board stays readable at mobile size, and clicking a cell opens its
   asset card.
6. **Logos** (owner decision: logos on cells, not only names):
   - logo files live next to the catalog data and are keyed by company, so
     they can be replaced without code changes;
   - when a logo is missing, a monogram is shown, as in the design;
   - each logo's source is recorded (an official brand or press page, or
     Wikimedia Commons). Trademark review happens before public release and
     is not part of this effort;
   - collecting the actual files is one task; if a source is unclear, the
     company keeps its monogram.
7. **Event log and chat** (owner decision: chat in MVP, inside the log):
   - **Log:** one feed shows human-readable game events derived from core
     events, and players' chat messages.
   - **Chat model:** chat is a server room feature, not core state. Messages
     go to every viewer in the room, are stored with the game so a reload
     shows them, and have a length limit and a per-player rate limit.
   - **Who can write:** spectators, such as eliminated players, can read and
     write.
   - **Visibility:** the log and chat show nothing that the viewer's
     projection hides.
8. **Language:** the interface is Russian, as in the design. Every string
   lives in one place, ready for later localization (CTO interpretation; the
   owner may choose another language).
9. **No behavior change:**
   - every stage 1-5 rule, command and projection stays as it is;
   - existing browser scenarios keep passing, with selectors updated as
     needed;
   - disabled controls still give their reason.
10. **Quality:**
    - keyboard focus and Esc work in dialogs;
    - text contrast is readable;
    - no layout breaks from 360 px to 1920 px;
    - the client bundle does not grow without reason. State the size in the
      design.
11. **CI headroom:** `compose-browser` was at 21 of 35 minutes after stage 5.
    Split or shard it in this effort so that stages 6-7 have room.

## Scope and non-goals

In scope:
- client restructure and stack;
- design system;
- every existing screen on desktop and mobile;
- board rendering;
- logos and their storage;
- log and chat, including the server and protocol parts of chat;
- browser tests and CI split;
- `openspec` client spec updates.

Not in scope:
- UI for casino, chance, final jail (stage 6) and trades (stage 7); those
  stages build on this system;
- accounts and email (after MVP);
- a native mobile app (after MVP, via Capacitor);
- stage 8 resilience, AFK and load items;
- trademark review.

## Canonical sources

- `docs/design/ui-mvp-v1.html`, `docs/design/ui-mvp-mobile-v1.html`,
  `docs/design/ui-brief.md`, `docs/design/README.md`.
- ROADMAP.md: "Технические решения", "Визуальный дизайн", owner decisions of
  2026-11-17.
- `openspec/specs/client/*` and the stage 1-5 designs under `docs/efforts/`.

## Architecture constraints

Accepted and mandatory, unchanged from earlier stages:
- headless deterministic core; the server is authoritative;
- clients send intents only and receive their own projection;
- one room per process with sequential commands;
- persist before broadcast;
- recovery from a snapshot plus the log tail.

Chat must not enter the deterministic core or its replay.

Staging deploys `main` automatically and must stay playable after every merge.

## Delegated and reserved decisions

Team Lead decides:
- the FSD slice layout;
- exact library versions;
- how tokens are expressed (Tailwind theme and CSS variables);
- breakpoints;
- the chat storage, protocol shape and limits;
- event-to-text mapping;
- animation details;
- task order and parallelism;
- test strategy;
- how logos are sourced and stored.

Escalate to the CTO:
- any design element that conflicts with a game rule or the projection;
- adding any paid service or font;
- any visual decision the designs leave open and that the owner would
  notice. Include a screenshot of the options.

## Dependencies, risks, and limits

- **Risk: one large restyle PR.** Keep the restructure, the tokens, and each
  screen group as separate reviewable PRs.
- **Risk: big-bang client.** Staging must stay playable after every merge.
- **Stages 6-7 wait** for this effort to finish.
- **Process limits:**
  - VM agents work on branches with PRs and never push to `main`. A PR with a
    product decision is merged by the owner; routine PRs merge after
    independent review and green CI.
  - Codex is the default Engineer engine. Claude is on the Pro plan, so keep
    parallelism modest.
  - Agents never dispatch, approve or cancel a production deployment.

## Required Team Lead output

- Technical design:
  - FSD layout and migration path;
  - tokens and theming;
  - component inventory mapped to Reka UI;
  - board rendering changes;
  - mobile layout;
  - logo storage;
  - chat server and protocol;
  - CI split.
- Task decomposition with ordering, integration plan, evidence plan, focused
  escalations.

## Completion evidence

- CI is green on the final `main`, and `openspec validate --all --strict`
  passes. Staging runs the final `main`.
- Every PR has an independent review.
- **Screenshots of every screen in criteria 3-4** at 1440x900 and 390x844,
  next to the matching design frame, for the owner. Store them in the
  evidence directory and link them in the report.
- **Browser scenarios:**
  - all stage 1-5 scenarios still pass;
  - a chat message from one client appears in the others and survives a
    reload;
  - a mobile-viewport game turn: roll, buy, auction, build;
  - the turn-order roll.
- **Logo coverage:** a list of companies with a logo or a monogram and the
  source of each logo.
- **CI timing** of the browser jobs after the split.
- ROADMAP.md "Сделано" is updated.

## Revision history

- 1: initial handoff.

## Acceptance

The Team Lead records acceptance of this exact revision or returns exact gaps.
A material change creates a new revision.
