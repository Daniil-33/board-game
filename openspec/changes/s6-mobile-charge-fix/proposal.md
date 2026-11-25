# Proposal

## Why

At mobile widths, stage 6 reveal and bank-charge surfaces can be shifted off-screen. In the chance-loss plus bank-charge state, the board also has transparent cell samples even after the board-ready frame check, while the other stage 6 states render fully. These defects block the stage 6 browser acceptance work.

## What Changes

- Keep stage 6 reveals and dialogs inside the viewport below 1024px on direct open, desktop-to-mobile resize, and landscape-to-portrait rotation.
- Identify and fix the actual cause of the chance-loss board rendering defect without hiding it through overlap, size changes, or extra capture waits.
- Add permanent browser assertions for mobile geometry, board pixels, and current desktop centring at the required viewports.
- Preserve desktop appearance and the lazy game-chunk boundary.

Out of scope: game rules, protocol or server changes; completion scenarios owned by TASK-s6-e2e; unrelated visual follow-ups.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `client/special-cells`: require mobile stage 6 surfaces to remain in the viewport and the board to remain fully rendered behind them.

## Impact

The change affects `apps/client` responsive layout, the Pixi board rendering path if confirmed by investigation, browser and client tests, and this capability's OpenSpec contract. It does not change public APIs or dependencies. The implementation must retain desktop centring and the existing lazy game chunk.
