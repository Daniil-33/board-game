# Proposal

## Why

The game has working purchase, auction, asset, rent, debt, and result data, but its surfaces do not yet follow the accepted visual design or provide the required modal behavior. This task completes the in-game decision flow on desktop and phones while preserving the rules and projected data as the source of truth.

## What Changes

- Present purchase and asset details through the responsive dialog, with a mobile bottom sheet; present auction inline on desktop and as a mobile bottom sheet.
- Complete asset rent-tier display, ownership actions, rent shortfall guidance, manual liquidation entry points, and liquidation summaries from the current view.
- Style elimination and game-over surfaces to the design, retain spectator chat, and provide leave or back-to-lobby actions.
- Verify focus containment, modal semantics, focus return, and which surfaces may close with Escape.
- Add component and accessibility coverage, preserve stage 1–5 browser selectors, capture desktop/mobile evidence, and report per-chunk gzip bundle changes.

Out of scope: page layout and panels, board rendering except the accepted tooltip follow-up, sound, stage 6–7 UI, and changes to game-core, protocol, or server.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `client/game-screen`: responsive decision and result surfaces, complete view-backed content, and modal accessibility behavior.

## Impact

Affected code is limited to `apps/client` widgets, shared UI, locale files, component tests, relevant browser selectors, and the client game-screen OpenSpec delta. The rules and command contracts described under GAME-BREAKDOWN.md headings “Покупка и аукцион”, “Активы, рента и строительство”, “Ипотека и расчёт долгов”, and “Банкротство” remain unchanged. No dependencies or server contracts are added.
