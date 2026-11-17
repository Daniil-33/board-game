# Proposal

## Why

The stage 5 core is merged, but the client cannot yet expose mortgage actions or explain liquidation, bankruptcy and final results. TASK-s5-client revision 1 implements the accepted stage 5 client outcome.

## What Changes

- Add helper-driven Mortgage/Redeem controls, amounts, reason texts and projected mortgage terms to asset cards.
- Show liquidation steps and bankruptcy notices to every viewer, including asset releases.
- Show eliminated viewers their reason while retaining read-only game viewing; render final results from the projection after reload.
- Add authoritative mortgage markers and update client specifications to the stage 5 rent event shape.
- Extend mock scenarios and component/connection/board tests; collect uncommitted screenshots.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `client/game-screen`: mortgage inspection/actions/markers, liquidation and bankruptcy notices, spectator elimination and persistent final results.
- `client/connection`: mortgage and redeem intents through existing protocol decoders.

## Impact

Only `apps/client/**` and this OpenSpec client delta. No core, protocol or server changes, new dependencies, visual redesign, localization or Playwright. The client consumes the server task's protocol v5 before integration and merges after it.

Sources: ROADMAP.md stage 5; GAME-BREAKDOWN.md headings "Ипотека и расчёт долгов", "Банкротство", "Завершение игры и симуляция"; effort revision 2 and Team Lead design sections Client, Projection and Liquidation order; TASK-s5-client revision 1. These accepted stage 5 decisions resolve the older open statements in GAME-BREAKDOWN.md.
