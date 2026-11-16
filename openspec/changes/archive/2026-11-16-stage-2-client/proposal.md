# Proposal

## Why

Stage 2 core now projects a generated board and balances, but the client still draws placeholder cells and omits money. TASK-s2-client revision 1 requires a functional display of those authoritative values.

## What Changes

- Replace placeholder board captions with generated cell names, distinct group markers and asset prices.
- Add a Vue participant balance panel and a dismissible asset details card opened from Pixi cell clicks.
- Use generated stage 2 boards in dev mock and test fixtures; verify live balance updates and selection behavior.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `client/game-screen`: generated board, public balances and asset inspection.

## Impact

Only apps/client and its OpenSpec delta. No server, protocol or core changes or new dependencies. Production code consumes projected data only; dev mock and test fixtures may use core generation. Sources: ROADMAP stage 2, accepted asset catalog proposal, GAME-BREAKDOWN sections «Участники и поле», «Начальная настройка и деньги», «Движение, круг и награда», effort design Client/Core and task revision 1.

Out of scope: purchases or other asset actions, economic calculations in the production client, stage 8 visual polish, stage 1 cosmetics, Playwright scenarios and protocol version changes (owned by TASK-s2-server).
