# Proposal

## Why

The accepted visual-design effort needs stable client module boundaries, locale keys and browser hooks before restyling. TASK-vd-fsd establishes those foundations while preserving the current English interface and all stage 1–5 behavior.

## What Changes

- Move client modules into the six accepted Feature-Sliced layers with slice public APIs and CI enforcement.
- Add Composition API vue-i18n plumbing, auto-discovered JSON locales, unchanged English keys, Intl wrappers, raw-text/missing-key lint and key parity verification.
- Add stable data-testid hooks and migrate browser selectors without changing assertions.
- Add the unused no-op sound API and record before/after gzip bundle totals (maximum growth 15 KB).
- Preserve GAME-BREAKDOWN.md sections “Порядок ходов, ход и кости”, “Активы, рента и строительство”, “Покупка и аукцион”, “Ипотека и расчёт долгов”, “Банкротство” and “Архитектурные контракты”.

Out of scope: game rules, server/protocol/core changes, Tailwind/Reka, tokens/fonts/restyling, Russian translation/default switch, locale selector and real sound playback.

## Capabilities

### New Capabilities

- `client/structure`: client layer/public API boundaries, stable test hooks and inert sound integration slot.
- `client/localization`: locale discovery, unchanged English presentation, locale keys and formatting validation.

### Modified Capabilities

None. Existing session, connection and game-screen behavior remains authoritative.

## Impact

apps/client, selector-only changes under e2e, client lint CI step and pnpm lockfile updates for exact pinned dependencies. No wire, storage or rules contract changes. Deliver one PR on agent/task-vd-fsd with separate moves, boundary, i18n and hook commits. Implementation begins only after Team Lead proposal approval in a fresh context.
