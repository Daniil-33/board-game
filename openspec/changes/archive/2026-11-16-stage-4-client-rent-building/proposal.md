# Proposal

## Why

Stage 4 core (PR #51) projects houses, the open rent settlement and per-asset rent quotes and exports the pure helpers `buildLegality`, `saleLegality` and `energyRentFor`, but the client cannot show or act on any of it. TASK-s4-client revision 1 supplies the bounded UI outcome of effort handoff C9 and C10 (`docs/efforts/stage-4-rent-building.md` revision 1, Team Lead design § "Client" and § "Projection").

## What Changes

- A rent settlement panel: every viewer sees payer, owner, asset and amount (energy also the dice sum); the payer gets "Pay rent" with amount and owner; the turn controls state that `EndTurn` pays an open settlement automatically.
- The asset card shows houses (0-4) and the current rent quote (fixed amount, or energy as formula and per-dice-point rate through `energyRentFor`).
- Build and Sell controls on the viewer's own monopoly assets: enabled from `buildLegality` / `saleLegality`, a disabled control shows one reason text per error code, Build shows the cost and Sell the refund (game-core `houseCost` / `houseRefund`), and the turn owner sees the builds left this turn from the view.
- `PayRent`, `BuildHouse { assetId }`, `SellHouse { assetId }` intents through the protocol connection, targeting the projected turn; rejected Acks show their error (with the same reason text for house codes).
- PixiJS house markers (1-4) per cell from `view.houses`, and a rent payment animation (amount moving from payer to owner) on `RentPaid`, the only event-driven element, never replayed from a `Welcome`.
- Dev mock scripts and tests through rent payment, auto-payment at end of turn, build, an illegal build and sell; fixtures use `PROTOCOL_VERSION`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `client/game-screen`: rent settlement display, rent quotes and houses on the asset card, build/sell controls, house markers, rent animation, EndTurn note.
- `client/connection`: commands may carry the protocol's `{ assetId }` payload for `BuildHouse` / `SellHouse`.

## Impact

`apps/client/**`, this OpenSpec delta, and (Team Lead ruling) two pure exported helpers `houseCost` / `houseRefund` in `packages/game-core/src/houses.ts`, used by the core itself, with a core unit test. Uses the core projection and the pure helpers named above. Depends on TASK-s4-server adding `PayRent`, `BuildHouse`, `SellHouse` to `@game/protocol` and `PROTOCOL_VERSION = 4`, and on the bonus-turn build quota fix (handoff revision 2, PR #53); no protocol or server edits here. No new dependencies.

Out of scope: rent, cost, refund or shortfall computation beyond the shared helpers; mortgage, debts, bankruptcy (stage 5); visual design (stage 8); Playwright e2e (TASK-s4-e2e).
