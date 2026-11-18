# CTO -> Team Lead Effort Handoff

```yaml
id: EFF-visual-design
revision: 3
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
8. **Language and localization** (owner decision 2026-11-17):
   - the interface is Russian by default;
   - multilingual support is built in now: every UI string is a translation
     key, and the language can be switched by adding a locale file without
     code changes;
   - numbers, money and times are formatted per locale;
   - game event texts in the log come from the same keys, not from server
     strings;
   - company names come from the catalog and are not translated.
   Only the Russian locale is required in this effort.
9. **No behavior change:**
   - every stage 1-5 rule, command and projection stays as it is;
   - existing browser scenarios keep passing, with selectors updated as
     needed;
   - disabled controls still give their reason.
10. **Sound** (owner decision 2026-11-17). Interface sound effects in a
    "medium" character: not soft lo-fi, not loud arcade. Sounds:
    - dice roll and double;
    - token steps;
    - purchase;
    - money in and money out;
    - auction: new bid, last seconds of the response timer, win;
    - your turn starts, your turn time runs out;
    - house built, asset mortgaged;
    - bankruptcy or elimination, victory;
    - new chat message.
    Requirements:
    - sources are CC0 libraries only (for example Kenney or Freesound CC0);
      each file's source and license are recorded;
    - a global mute and volume control is remembered per browser;
    - nothing plays before the user first interacts with the page;
    - one's own events sound different from other players' events, so the
      game is not noisy;
    - audio files are small and loaded lazily;
    - leave named slots for stage 6-7 sounds (casino, chance, jail, trade
      offer).
    This can be the last task of the effort.
11. **Quality:**
    - keyboard focus and Esc work in dialogs;
    - text contrast is readable;
    - no layout breaks from 360 px to 1920 px;
    - the client bundle does not grow without reason. State the size in the
      design.
12. **CI headroom:** `compose-browser` was at 21 of 35 minutes after stage 5.
    Split or shard it in this effort so that stages 6-7 have room.

13. **Load performance (revision 3, owner report 2026-11-18: the app loads
    slowly in desktop and phone browsers).** CTO measurement on staging
    80660e6: `app-*.js` is 814 KB and is sent uncompressed; the CSS and the
    logo SVGs are uncompressed too. The edge proxies the web container with
    nginx's default HTTP/1.0, and the client nginx compresses only HTTP/1.1
    requests, only for `image/svg+xml`. 32 light brand logos are larger than
    20 KB (1.5 MB total; `banks-5.svg` is 82 KB, while its dark variant is
    0.5 KB). Pixi is part of the first-load chunk. Requirements:
    - through the staging edge, JS, CSS, SVG and JSON responses are compressed
      (gzip, or Brotli if the team chooses), and a deploy test asserts this
      through the edge, not only against the container;
    - the edge serves HTTP/2 to browsers and HTTP/1.1 to the web upstream;
    - brand logos are optimized without visible change: no single logo file
      in either the light or dark set is larger than 20 KB, except for a
      listed, evidence-backed exception retained pending an owner decision on
      visible geometry simplification. Report raw and gzip size for the whole
      set before and after. Changed SVGs are compared at 512x512 and 1024x1024:
      no more than 0.5% of pixels may differ by more than 16/255 in any
      channel, and no pixel may differ by more than 64/255. Save a side-by-side
      PNG for every changed file;
    - only the logos needed for the current screen are requested;
    - login, lobby and room screens do not download Pixi or board code. These
      load with the game screen;
    - evidence: transferred bytes and Lighthouse mobile metrics (LCP, TTI or
      TBT) on staging for login and for the game screen, before and after.
    No separate media service or CDN. Logos are already separate files with
    immutable caching, so a separate service would not reduce what the
    browser downloads. The cause is missing compression and asset size. If
    the owner asks for a media service again after seeing the measurements,
    that is a new architecture decision.
    Do this before the sound task, in parallel with the dialog follow-up.
    The compression fix is the first PR.

### TASK-vd-load-split logo follow-up

The 134-file light and dark set totals 2,113,222 B raw / 734,615 B gzip before this pass and 2,039,309 B raw / 713,361 B gzip after it. The `microfinance-4.svg` and `microfinance-4-dark.svg` brand copies are excluded from SVGO and remain byte-identical to the geometric originals per the catalog contract. The 32 files still above 20,000 bytes after the additional safe SVGO pass are recorded below. Six are retained at their best tolerance-passing SVGO candidate; the other 26 retain their original bytes because no candidate passed the approved raster tolerance. Reducing these files further requires visible geometry simplification and an owner decision. No manual geometry or color changes are included in TASK-vd-load-split.

| Brand logo | Raw bytes | Gzip bytes | Follow-up reason |
| --- | ---: | ---: | --- |
| `banks-4-dark.svg` | 22,001 | 9,060 | needs visible geometry simplification |
| `banks-4.svg` | 22,001 | 9,060 | needs visible geometry simplification |
| `banks-5-dark.svg` | 82,788 | 20,615 | needs visible geometry simplification |
| `banks-5.svg` | 82,788 | 20,615 | needs visible geometry simplification |
| `commerce-4-dark.svg` | 56,044 | 20,894 | needs visible geometry simplification |
| `commerce-4.svg` | 56,044 | 20,894 | needs visible geometry simplification |
| `commerce-6-dark.svg` | 63,012 | 24,538 | needs visible geometry simplification |
| `commerce-6.svg` | 63,012 | 24,538 | needs visible geometry simplification |
| `energy-1-dark.svg` | 53,461 | 18,204 | needs visible geometry simplification |
| `energy-1.svg` | 53,461 | 18,204 | needs visible geometry simplification |
| `energy-2-dark.svg` | 33,726 | 11,177 | needs visible geometry simplification |
| `energy-2.svg` | 33,726 | 11,608 | needs visible geometry simplification |
| `fuel-4-dark.svg` | 57,933 | 16,573 | needs visible geometry simplification |
| `fuel-4.svg` | 57,933 | 16,573 | needs visible geometry simplification |
| `groceries-1-dark.svg` | 44,478 | 13,715 | needs visible geometry simplification |
| `groceries-1.svg` | 44,478 | 13,715 | needs visible geometry simplification |
| `insurance-6-dark.svg` | 58,574 | 18,139 | needs visible geometry simplification |
| `insurance-6.svg` | 58,574 | 18,139 | needs visible geometry simplification |
| `media-2-dark.svg` | 81,577 | 28,072 | needs visible geometry simplification |
| `media-2.svg` | 81,577 | 28,072 | needs visible geometry simplification |
| `media-3-dark.svg` | 23,543 | 8,901 | needs visible geometry simplification |
| `media-3.svg` | 23,543 | 8,901 | needs visible geometry simplification |
| `microfinance-2-dark.svg` | 41,762 | 15,719 | needs visible geometry simplification |
| `microfinance-2.svg` | 41,762 | 15,719 | needs visible geometry simplification |
| `microfinance-3-dark.svg` | 30,966 | 10,576 | needs visible geometry simplification |
| `microfinance-3.svg` | 30,966 | 10,576 | needs visible geometry simplification |
| `microfinance-6-dark.svg` | 35,541 | 12,779 | needs visible geometry simplification |
| `microfinance-6.svg` | 35,541 | 12,779 | needs visible geometry simplification |
| `technology-5-dark.svg` | 25,983 | 8,298 | needs visible geometry simplification |
| `technology-5.svg` | 25,983 | 8,376 | needs visible geometry simplification |
| `telecom-3-dark.svg` | 37,859 | 12,167 | needs visible geometry simplification |
| `telecom-3.svg` | 37,859 | 12,167 | needs visible geometry simplification |

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
- **Sound list:** each sound with its trigger, source and license; a short
  screen recording or a test that sounds fire on the right events and
  respect mute.
- **Localization:** all strings go through translation keys. A test fails
  when a string is hard-coded or a key is missing.
- **CI timing** of the browser jobs after the split.
- ROADMAP.md "Сделано" is updated.

## Revision history

- 1: initial handoff.
- 2: owner decisions 2026-11-17: interface sound effects (criterion 10);
  Russian by default with multilingual support built in (criterion 8).
- 3: owner report 2026-11-18 on slow loading: load performance (criterion
  13). The deploy edge and client nginx configuration are in scope for it.
  A separate media service was considered and not adopted.

## Acceptance

The Team Lead records acceptance of this exact revision or returns exact gaps.
A material change creates a new revision.
