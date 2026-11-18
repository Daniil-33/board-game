# Visual design: Team Lead technical design

Effort: `EFF-visual-design`. Handoff `docs/efforts/visual-design.md` revision
2 (docs PR #72), accepted by the Team Lead on 2026-11-17 at main `e893fb4`.
Criterion numbers (C1..C11) refer to the handoff. This document holds only
the decisions delegated to the Team Lead. The look comes from the owner's
designs; the rules come from `ROADMAP.md`.

## Design sources and how to read them

- **Desktop:** `docs/design/ui-mvp-v1.html` (main).
- **Mobile:** `docs/design/ui-mvp-mobile-v1.html` (main, merged in PR #70).
- **Format of the desktop file.** It is a self-unpacking bundle:
  - `<script type="__bundler/manifest">` holds gzip+base64 HTML frames, one
    per screen, and `__bundler/template` maps the frame ids to titles;
  - the frames embed their own bundles and fonts.

  Read them by opening the page in Chromium (Playwright) and taking computed
  styles and screenshots of each iframe. Do not hand-copy from minified
  markup.
- **Numbers.** The numbers in the designs are illustrative. Every amount
  shown comes from the view and the shared game-core helpers.

## Stack and versions (C1)

| Item | Choice |
|---|---|
| Vue | 3.5 (unchanged) |
| Tailwind CSS | `tailwindcss` 4.1 with `@tailwindcss/vite` (CSS-first `@theme`, no JS config) |
| Headless components | `reka-ui` 2.x (Dialog, AlertDialog, Popover, Tooltip, Tabs, Toast, a Dialog-based bottom sheet, VisuallyHidden) |
| Fonts | `@fontsource-variable/inter` and `@fontsource-variable/unbounded` (OFL, bundled woff2, latin + cyrillic subsets only), imported once in `app/` |
| Board | `pixi.js` 8 (unchanged) |
| i18n | `vue-i18n` 11 (Composition API, `legacy: false`), JSON locale files auto-discovered from `shared/i18n/locales/*.json`; `Intl` formatting; `@intlify/eslint-plugin-vue-i18n` for raw-text and missing-key checks |
| Sound | Web Audio API behind `shared/sound` (no library); lazily fetched `.mp3` files |
| Not used | Vuetify, any CSS-in-JS, run-time Google Fonts, icon fonts |

Exact patch versions are pinned in `package.json` by the task that adds them,
using versions published at least two weeks earlier.

## Feature-Sliced layout (C1)

```
apps/client/src/
  app/        main.ts, App.vue, page switch, global styles (Tailwind entry, fonts), providers (toasts)
  pages/      login/, lobby/, room/, game/ (includes the turn-order roll), game-over/
  widgets/    board/ (PixiJS), players-panel/, turn-header/ (turn, phase, timer, dice),
              event-feed/ (log + chat), my-turn/, my-assets/, purchase-card/, auction-panel/,
              asset-card/, rent-panel/, debt-notices/, elimination/, mobile-nav/,
              reconnect-banner/
  features/   roll-dice, end-turn, resign, purchase-choice, auction-bid, pay-rent,
              build-house, sell-house, mortgage, redeem, send-chat, create-room, join-room,
              copy-invite
  entities/   game (view store, projection selectors), player (colors, badges),
              asset (rent table, legality adapters), event (event -> text), chat (messages),
              room (lobby data)
  shared/     ui/ (Reka wrappers and primitives), config/ (tokens.css), i18n/, api/ (http,
              socket, connection, protocol glue), lib/ (money, time, monogram),
              sound/ (a no-op slot, see below)
```

- **Import rule:** a layer imports only from layers below it (`app > pages >
  widgets > features > entities > shared`). Enforce it with an ESLint or
  `dependency-cruiser` boundary rule in CI.
  `shared` is made of segments, not slices: shared segments may import each
  other through a segment's `index.ts` with no cycles (`shared/i18n` imports no
  other shared segment). TL decision 2026-11-17 on a TASK-vd-fsd question.
- **Slice API:** each slice exposes a public `index.ts`.
- **Today's modules move as follows:**
  - `game/*` goes to `entities/*`;
  - `board/*` goes to `widgets/board`;
  - `components/*` go to widgets or features;
  - `screens/*` go to `pages/*`;
  - `net/*` and `api/*` go to `shared/api`;
  - `store/*` goes to `entities/game` and `entities/session`.
- **Sound (C10)** lives in `shared/sound`; see § Sound. Widgets call `playSound(id, { own })` from event handlers only.
- **Stable test hooks.** The restructure adds `data-testid` attributes to
  every element the browser specs touch, and moves the specs to them. Later
  restyles then do not break e2e selectors.

## Tokens and theming (C2)

- **One source:** `shared/config/tokens.css` defines CSS custom properties
  taken from the design's "Дизайн-система и токены" frame:
  - surface, text, accent and semantic colors;
  - the action, auction, casino and chance gradients;
  - the group gradients `--group-m1..m8`, `--group-logistics` and
    `--group-energy`;
  - six player colors `--player-1..6`;
  - radii, shadows, spacing;
  - `--font-display` (Unbounded) and `--font-ui` (Inter).
- **Tailwind.** Its `@theme` maps these variables to utilities, for example
  `bg-surface`, `text-muted`, `bg-group-m3` and `font-display`. Components
  use utilities or the variables, never raw hex values. A lint check rejects
  hex colors in `.vue` files outside `shared/config`.
- **PixiJS.** The board reads the same tokens through one adapter,
  `shared/config/pixi-theme.ts`, which reads the computed CSS variables once
  at start-up. The board has no colors of its own.
- **Numbers.** Money and timers use `font-variant-numeric: tabular-nums`
  through a `Money` and a `Countdown` primitive.
- **Theme.** One theme (the design is "near dark, airy light elements"). No
  light/dark toggle in this effort.

## Component inventory (Reka UI mapping)

| Design element | Implementation |
|---|---|
| Buttons (primary gradient, secondary, danger, disabled with reason) | `shared/ui/Button` + `Tooltip` for the reason, which is also visible as text on mobile |
| Purchase card, asset card, game over, elimination, turn-order roll | `Dialog` (desktop) / `Sheet` (mobile bottom sheet) through one `ResponsiveDialog` |
| Auction panel | an inline widget on desktop; a `Sheet` on mobile |
| Resign confirmation | `AlertDialog` |
| Toasts for rejected actions | `Toast` |
| Player badges, status chips | `shared/ui/Badge` |
| Mobile navigation "Поле · Активы · Журнал · Ещё" | `Tabs` with a bottom tab bar |
| Cell hover details (desktop) | `Tooltip` / `Popover` |

**Accessibility (C11).** Focus trap and Esc come from Reka. Contrast: text
tokens are checked to AA (4.5:1) against their surfaces by a unit test over
the token table.

## Breakpoints and layout (C4, C11)

- **< 1024 px: mobile layout per the mobile design.**
  - Board on top, sized to the width.
  - Bottom navigation "Поле · Активы · Журнал · Ещё".
  - Purchase and auction appear as bottom sheets.
  - "Ещё" holds resign, the rules summary and leaving.
- **≥ 1024 px: three columns per the desktop design.**
  - Side columns are fixed at about 280 px from 1280 px and shrink to about
    240 px between 1024 and 1279 px.
  - The board scales to the centre column.
- Everything is tested at 360, 390, 768, 1024, 1440 and 1920 px with no
  horizontal overflow.
- Every desktop action has a mobile path.

## Board rendering (C5)

- **Widget.** `widgets/board` keeps a single PixiJS `Application`. Its cell
  geometry comes from `CLASSIC_40`, and it renders only from the view.
- **Cells:** the group gradient price strip (`FillGradient`), the logo
  sprite or a monogram, the name (shortened by measurement) and the price.
- **Corners:** drawn per the design.
- **Markers:**
  - owner: a border or ribbon in the player color;
  - houses: 1-4 pips;
  - mortgage: a diagonal hatch overlay plus dimming;
  - tokens: stacked per cell;
  - dice: in the centre panel (a Vue component in `turn-header`; the
    PixiJS board only shows movement).
- **Animations:** token movement and the rent transfer (existing),
  restyled. They never block state.
- **Mobile readability.** At 360 px wide the board is about 360 px square
  (cells about 30 px). Small cells show the strip, the logo or monogram and
  the owner/house/mortgage markers only, with no text. Tapping a cell opens
  the asset card.
- **Textures.** Logos load lazily as textures from hashed URLs. A missing or
  failed logo falls back to the monogram.

## Logos (C6)

The owner-commissioned set (2026-11-17) covers all 67 catalog ids, and
replaced the 12 scraped logos in `TASK-vd-logos-set`.

**Storage:** `packages/game-core/src/catalog/logos/`, next to `ua-1.json`.
- `<companyId>.svg` is for light backgrounds.
- `<companyId>-dark.svg` is for dark backgrounds, and it is **mandatory**.
- SVG only: `viewBox="0 0 64 64"`, transparent, outlines.
- The directory also holds `README.md`, `FONT-LICENSE.txt` (the
  DejaVu-derived letter geometry; it ships with the files) and
  `.gitattributes`.

**Manifest `logos.json`.** Exactly these five fields per id: `{ file:
"<id>.svg", darkFile: "<id>-dark.svg", monogram, source: "owner-commissioned
set, 2026-11-17", license: "see FONT-LICENSE.txt" }`. The validation test
asserts the key set, file existence, no orphan files, at most 40 KB per file,
the viewBox and SVG safety.

**Drop-in.** The client resolves files only by the naming convention, with
Vite `import.meta.glob(..., { query: '?url', eager: true })` into a
`companyId → { light, dark }` map. A replacement set with the same names
needs no code change.

**Code boundary.** game-core code does not import the logo files.

**Rendering (board task).**
- Light cells: the light file. The board does not need a plate for this
  set, but a plate behind the logo is still allowed.
- Dark surfaces ("Мои активы", the dark side panels): the `-dark` file.
- A file that fails to load falls back to the manifest `monogram` text on
  the group gradient.

**Two sets (owner, 2026-11-17 evening).**
- `logos/brand/` holds the v2 brand icons, the default.
- `logos/geometric/` holds the v1 set, the fallback. The brand set's
  `microfinance-4` uses the geometric icon.
- The runtime config `logoSet` (`LOGO_SET`) selects the set. `brand` is
  the default in every environment, production included (owner decision
  2026-11-17). `geometric` is only a fallback.
- Logos are always lazily loaded URLs and never inlined into JS. See
  `TASK-vd-logos-brand`.
- The brand set is kept pixel-identical after svgo: about 2.1 MB raw and
  0.77 MB gzip in total, with a 2.2 MB raw cap and recorded per-file
  exceptions. A game fetches only its ~28 companies. nginx serves SVG
  gzipped, and hashed assets are cached as immutable.

**Feed ordering (REV-vd-chat-2 RVW-002).** The event feed merges live items
by arrival order, and history items (from `Welcome`) by server `at`.

## Event log and chat (C7)

**Event feed.** The client maps the core events it receives to entries with
`entities/event/describe.ts`:
- each entry has an icon, a Russian text from `ru.ts`, the actors and the
  amounts taken from the event;
- an unknown event type yields no entry.

The feed merges these entries and chat messages by arrival order and time.

**History on reload.**
- The server's `Welcome` frame adds `history: { events, chat }`.
- `events` are the visible events of the last 200 log entries, filtered for
  that viewer by the same per-viewer event projection the `Update` path uses.
  So the log shows nothing the projection hides.
- `chat` holds the last 200 messages.

**Chat model (server room feature, outside the core and its replay):**
- **Table** `chat_messages`:
  - `room_id` FK;
  - `seq` integer, unique per room, assigned by the room process;
  - `author_id`;
  - `text`;
  - `created_at`.

  Migration `0007`.
- **Client frame** `ChatSend { clientMsgId, text }` from any room member,
  including eliminated players and spectators who are members. Non-members
  are rejected.
- **Validation:**
  - text is trimmed, 1-300 characters, with no control characters except
    newline, at most 4 lines;
  - the rate limit is 5 messages per 10 s per player, plus a 500 ms minimum
    interval;
  - a rejection gets a `ChatAck { clientMsgId, ok: false, reason }`.
- **Order:** persist, then broadcast `Chat { message: { seq, authorId, text,
  at } }` to every connection of the room, then `ChatAck { ok: true }`.
- **Persistence.** Chat rows survive restart and are served in `Welcome`.
  Finished rooms keep their chat.
- **Protocol** gains these frames under the existing decoders, and
  `PROTOCOL_VERSION` becomes 6.

## Language and localization (C8)

**Locale files.**
- `vue-i18n` with `legacy: false`. The default and fallback locale is `ru`.
- Locales are JSON files in `shared/i18n/locales/<code>.json`, discovered
  with `import.meta.glob`. Adding `en.json` adds a language with no code
  change.
- The active locale comes from a stored preference, then the browser, then
  `ru`. A small language selector lists the discovered locales; with only
  `ru` it is hidden.

**Keys.**
- Every UI string, including the error-code reasons and the event-feed
  texts, is a key.
- Event texts are built client-side from event payloads and keys; the
  server never sends display text.
- Company and category names come from the catalog and are not translated.

**Formatting.** `shared/lib/format` wraps `Intl.NumberFormat` and
`Intl.DateTimeFormat` for the active locale:
- money is a grouped integer plus the currency mark from the locale file;
- timers;
- times of day.

**Enforcement (CI):**
- `@intlify/vue-i18n/no-raw-text` on `.vue` templates;
- `no-missing-keys` against `ru.json`;
- a unit test that every key used in code exists in `ru.json`, and that
  `ru.json` has no unused keys.

The restructure task introduces the i18n plumbing and moves the existing
strings. The tokens task translates them to Russian per the design.

## No behavior change (C9)

- No core, rule or projection change.
- The only protocol and server change is chat and `Welcome.history`.
- Stage 1-5 browser specs keep passing, with selectors moved to
  `data-testid`.
- Disabled controls still show their reason.

## Bundle size (C11)

- The restructure task records the baseline (`vite build`: JS and CSS gzip
  sizes).
- **Budget:**
  - JS gzip may grow by at most 90 KB over the baseline (Reka is
    tree-shaken and Tailwind is CSS only);
  - CSS gzip at most 40 KB;
  - fonts are latin + cyrillic woff2 only.
- Each task reports its sizes, and CI prints them.

**Measurement and status (TL decision, 2026-11-18).**
- **What counts:** the budget covers all emitted JS:
  - the initial route (the HTML entry and its static imports);
  - lazy chunks;
  - separate entries;
  - the runtime config.

  It is not redefined as initial-route only. The lazy PixiJS chunks existed
  before this effort, so that would add no real headroom.
- **Per-task report:** each UI task reports initial-route JS and lazy JS
  separately against its merge base, in a per-chunk table, using one method
  per comparison (Node zlib on each file).
- **Baseline:** the pre-restructure baseline is 253,863 bytes of gzip JS.
  - At TASK-vd-game-layout (candidate on a931758) the total is about
    330.6 KB, so about +77 KB of the +90 KB.
  - Nearly all the growth is in the initial-route `app` chunk: shell pages,
    Reka dialogs and toasts, localized copy, and the game layout.
- **Remaining headroom (about 13 KB)** is for TASK-vd-game-dialogs and
  TASK-vd-sound:
  - If either task would take the total above +85 KB, that task also splits
    the routes: the game page and its dialogs become a lazy route chunk
    behind the existing screen switch, with a loading state.
  - The lazy part then counts toward the total budget, and the initial route
    has to shrink.
  - The sound engine stays a few KB of initial JS, and the audio files are
    never inlined.

## CI split (C12)

`compose-browser` (21 of 35 min) becomes two parallel jobs in the same
workflow:
- `compose-browser`: the production stack scenarios (stages 1-3, chat,
  mobile turn, turn-order roll);
- `compose-browser-fixtures`: the isolated fixture stack (stages 4-5).

`compose-browser-seeded` stays. Each job keeps its own evidence artifact.
The staging deploy keeps waiting on the CI workflow, so a new job gates it
automatically. Main has no branch protection, so there are no required-check
names to update.

## Sound (C10)

**Module.** `shared/sound` exposes:
- `playSound(id: SoundId, opts?: { own?: boolean })`;
- `soundSettings` (a reactive `{ muted, volume }`, remembered in
  `localStorage`).

**Engine.**
- One `AudioContext`, created on the first `pointerdown`/`keydown`. Nothing
  plays before that; calls made before it are dropped.
- Buffers are fetched lazily on first use and cached.
- Files are `.mp3`, mono, 10-60 KB each, in `shared/sound/files/`.
- `sounds.json` records `{ id: { file, source, sourceUrl, license: 'CC0',
  author } }`. Only CC0 sources (Kenney, Freesound CC0).

**Own versus others.** Another player's event plays at a lower gain (about
−9 dB) and only for the ids that make sense for others: dice, purchase,
auction win, bankruptcy and victory, chat. The rest play only for one's
own events.

**Sound ids:**
- `dice-roll`, `dice-double`, `token-step`;
- `purchase`, `money-in`, `money-out`;
- `auction-bid`, `auction-tick`, `auction-win`;
- `turn-start`, `turn-timeout`;
- `house-built`, `asset-mortgaged`;
- `bankrupt`, `victory`;
- `chat`.

**Reserved slots** (no files yet): `casino`, `chance`, `jail`,
`trade-offer`.

**Triggers.** One mapping, `entities/event/sounds.ts`, turns events and
timer thresholds into ids, so tests can assert them.

**Controls.** Mute and volume sit in the top bar (desktop) and in "Ещё"
(mobile).

## Tasks and order

```
Wave 1:  TASK-vd-fsd (restructure, testids, baseline) ─┐     TASK-vd-logos (files + manifest, game-core data only)
Wave 2:  TASK-vd-tokens (Tailwind, Reka, tokens, fonts, i18n, shared/ui) ─┐   TASK-vd-chat (protocol v6, server chat, Welcome history, CI split, client entities)
Wave 3:  TASK-vd-board (needs tokens + logos)        TASK-vd-shell-pages (login, lobby, room, turn-order roll; desktop + mobile)
Wave 4:  TASK-vd-game-layout (game page, columns, mobile nav, panels, feed + chat UI, toasts, banner)
Wave 5:  TASK-vd-game-dialogs (purchase, auction, asset card, rent, liquidation, elimination, game over)
Wave 6:  TASK-vd-sound (CC0 files, engine, triggers, controls)   TASK-vd-e2e (screenshots vs design, chat/mobile/turn-order scenarios, logo coverage, CI timing, ROADMAP; after sound for the sound evidence)
```

- At most two Engineers at a time.
- Every PR keeps staging playable and every browser spec green.
- Waves 4 and 5 run one after the other, because they edit the same page.

## Evidence plan

- **Per task:** an independent review, and green CI on the exact head (all
  browser jobs).
- **Per UI task:** screenshots at 1440x900 and 390x844 next to the matching
  design frame, in `/srv/agents/evidence/<task>/`.
- **Effort completion:** the handoff list.

## Escalations

- **None open.** A design element that conflicts with a rule (for example
  illustrative numbers) follows the rules without escalation.
- **Escalate with a screenshot of the options:**
  - an owner-visible choice the designs leave open;
  - a paid asset.
