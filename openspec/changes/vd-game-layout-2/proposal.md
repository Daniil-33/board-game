# Proposal

## Why

The current game screen still differs materially from the accepted desktop design: its turn controls and sound controls sit outside the board centre, its board is clipped at 1440×900, and a setup caption remains visible during an auction. Numeric house counts also use incorrect Russian grammar. This change closes handoff gaps G2, G3 and the G4 centre-caption gap while preserving the accepted game rules.

## What Changes

- Move the desktop turn header, dice/last roll, and journal with chat into the board centre; fit the full board at 1440×900 and preserve the current mobile navigation and layout.
- Add the desktop top bar with the product name, correctly pluralized player count, connection/reconnect status, and settings control. Move volume and mute controls behind settings. Omit the room label entirely because the join code is a secret and the internal room id is not user-facing; omit the round counter because no projection field supplies it.
- Show phase-relevant turn actions only, keeping currently unavailable phase actions disabled with their reason.
- Use locale plural forms for numeric count strings, including Russian house-count forms.
- Make the board-centre caption reflect the current projected phase, including auction and game over.
- Capture the required desktop and mobile evidence from the committed producer at the PR head.

Out of scope: protocol, server, game-core, rules, tokens, logo assets, and screenshot producer changes. This presentation change implements the UI contract in `GAME-BREAKDOWN.md` under “Порядок ходов, ход и кости”, “Покупка и аукцион”, “Активы, рента и строительство”, “Ипотека и расчёт долгов”, and “Завершение игры и симуляция”; it does not alter those rules.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `client/game-screen`: define desktop game-screen grouping and top bar, phase-appropriate actions and captions, and correct localized count forms.
- `client/localization`: define locale-correct plural forms for numeric count messages.

## Impact

- Client page and widgets: game page, turn header, my-turn actions, board-centre display, event feed, and settings popover.
- Russian and English locale files and client unit/browser specs.
- OpenSpec delta for `client/game-screen`.
- No API, protocol, server, game-core, or dependency changes.

## Known design deviations

- The room label is omitted entirely: the join secret must not be shown and the internal room id is not user-facing.
- The round counter is omitted because the projection has no game-round counter; this effort adds no projection fields.
- The turn timer keeps its numeric countdown and omits the design's progress bar because the projection exposes a deadline but no turn duration; this effort adds no projection fields or client-side duration estimate.
