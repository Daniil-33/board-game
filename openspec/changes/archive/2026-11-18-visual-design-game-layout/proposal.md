# Proposal

## Why

The game page needs to match the approved desktop and mobile frames while keeping the existing game actions reachable at every supported viewport.

## What Changes

- Arrange the desktop page into players, board and journal, and actions and assets. Provide bottom navigation on mobile.
- Show projected player and turn status, asset controls, and a combined event and chat journal.
- Surface command rejections in bounded toasts and announce reconnection while a new Welcome is pending.

## Capabilities

### New Capabilities

### Modified Capabilities

- `client/game-screen` gains responsive layout, player and turn presentation, action and asset panels, a combined event and chat journal and composer, command toasts and reconnect feedback.

## Impact

The changes affect client pages, widgets, presentation features, localization and tests. The authoritative behavior remains governed by GAME-BREAKDOWN.md sections «Порядок ходов, ход и кости», «Активы, рента и строительство», «Покупка и аукцион», «Ипотека и расчёт долгов» and «Банкротство».

Out of scope are core, protocol and server changes, board rendering, sound, and restyling existing game dialogs.
