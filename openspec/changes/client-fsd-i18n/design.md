# Design

## Context

See proposal.md for scope. Base is 75f8f9d (handoff revision 2 merged via PR #72); TASK-vd-fsd revision 1 is acknowledged. Technical design source is the Team Lead worktree docs/efforts/visual-design/design.md. Current client has screens, components, game, board, api, net and store directories, a root client coordinator, Vue/Pixi entrypoint, happy-dom component tests and mock scenario tests. CI already runs production, seeded and stage 4–5 fixture browser suites.

## Goals / Non-Goals

Meet the two delta capabilities without changing commands, timing, connection lifecycle, styling or English output. Do not introduce empty slices for future widgets/features, language selection, sound settings or event-feed features.

## Decisions

### Module mapping and dependency contracts

- app owns main.ts, App.vue, style.css and browser wiring; index.html points to the new entry.
- pages/login, lobby, room, game and game-over receive their screens.
- widgets/board receives all board modules. widgets/players-panel, turn-header, asset-card, purchase-card, auction-panel, rent-panel and debt-notices receive the respective components. TurnOrder and TurnTimer stay private within turn-header.
- features/turn-actions receives ActionButtons; features/resign receives ResignControl. The current client.ts coordinator becomes features/client-session, retaining createClient/useClient and injection keys. Pages may import it, widgets continue to receive props/emits.
- entities/game owns game state, view selectors, animation and debt helpers. House/mortgage legality adapters join this same slice to avoid prohibited peer-entity imports; entities/session owns session persistence.
- shared/api receives api and net. Connection input/state types must be defined structurally in shared/api, with entity game state satisfying that contract, rather than importing entities upward. The coordinator's Board contract belongs below widgets (entities/game); its signatures use core view and animation types, never widget implementation types. app composes the concrete board.
- shared/lib owns formatting; shared/i18n owns locale provider and messages; shared/sound exports SoundId = never and no-op playSound(id, opts?).

Every populated slice gets index.ts. Internal relative imports remain private within a slice. Cross-slice imports use only lower-layer public indexes. No compatibility directories remain. Move-only commit includes minimal contract relocation needed to preserve dependency direction and import fixes, without logic changes. Tests remain in src/__tests__ so existing Vitest discovery remains stable; external test imports use public indexes.

### Enforcement

Choose eslint-plugin-boundaries with Vue/TypeScript parsing to enforce layer order and public entrypoints, including type imports; use @intlify/eslint-plugin-vue-i18n for no-raw-text and no-missing-keys. Exact versions must be published by 2026-11-03, pinned during Apply. A client lint script runs in CI. Verify negative cases by temporary upward, peer-slice, private and missing-key/raw-text violations, then remove them. Unlike a hand-written dependency scanner, the selected checker uses the supported module parser.

### Localization

Use vue-i18n 11 with legacy:false; import.meta.glob eagerly discovers locale JSON. Default/fallback en, no active-locale preference or selector in this task. Translation keys are dotted semantic paths grouped by screen/widget/domain (e.g. login.nickname, reasons.house.NOT_OWNER); document rules in shared/i18n/README.md. Templates and TypeScript helpers use the same translator; reason maps retain code-specific wording and public helper results. Use full sentences with named interpolation rather than concatenation; preserve punctuation and literal syntax through vue-i18n escaping. Catalog, protocol codes, user names and server messages stay external data, not artificial keys. Include client-owned Pixi text and aria/title/placeholder attributes in the inventory.

A parser-based key inventory checks literals in Vue and TS plus explicit typed key maps; avoid unconstrained dynamic key construction. Flatten en.json and compare exact used/defined sets in a unit test. Ignore only non-UI literals with narrow documented lint configuration; never suppress entire source folders. Empty ru.json is permitted and excluded from full translation parity until its owning task.

Intl wrappers preserve existing call-site output options: do not introduce grouping, currency suffixes or timer changes that the baseline did not display. Test formatted fixtures and exact English output. Keeping formatting compatible takes precedence over adopting later effort styling.

### Stable selectors and bundle evidence

Migrate existing data-test values to data-testid; update component selector helpers only, preserving all existing behavioral assertions. Add hooks for heading/input/canvas/row cases selected by structure or text. Text assertions remain. Repeated rows use stable domain identity attributes alongside hooks. e2e imports of board layout move to the board public API.

Capture pristine Vite build output before any dependency/product edit at the recorded base. Save per-file JS/CSS raw and gzip bytes plus totals in /srv/agents/evidence/TASK-vd-fsd/. After build uses identical Node/pnpm/build options; compare sum of gzip sizes of all emitted JS and CSS (including lazy chunks), with a maximum increase of 15,000 bytes. Record both totals in PR body. No dependency changes to unrelated packages.

## Risks / Trade-offs

- Coordinator and connection type inversion → structural shared contracts, preserve fake-injected tests and inspect the dependency graph.
- Translation interpolation/formatting changes → preserve existing test assertions, add exact text/key parity checks and compare browser output.
- Tree-shaken locale/compiler cost → measure the complete emitted bundle and escalate if beyond the bound.
- Source docs may merge while implementation waits → reconcile task revision and Team Lead design before fresh Apply; never silently absorb scope changes.

## Migration Plan

After Team Lead approval, start Apply in a fresh context. Capture baseline, then commit (a) moves and path fixes, (b) boundaries, (c) i18n/format/sound and (d) hooks. Run full acceptance checks and inspect final scope. Push and open one PR using agentctl operation intent/verification records, request independent exact-SHA review, resolve findings, archive OpenSpec in the PR after passing review and revalidate final head. Team Lead accepts delivery; Engineer does not merge. Rollback is a normal PR revert; no persisted schema migration is involved.
