# Design

## Context

See proposal.md and TASK-s4-client revision 1. The game screen already has a shared 250 ms clock, pending command types, a name resolver, Ack error messages, `canIssue` / `actionAvailability` selectors in `game/view.ts`, an `AnimationQueue` fed by `Update` events, an ownership layer in `BoardScene`, and an informational `AssetCard`. The client command union and `PROTOCOL_VERSION` belong to `@game/protocol`, which TASK-s4-server changes in parallel.

## Goals / Non-Goals

Goals: render stage 4 projection fields and send the three new intents, keeping the view as the only source of state.
Non-goals: computing rent, cost, refund, shortfall or legality outside the shared core helpers; protocol/server edits; core edits beyond exporting `houseCost` / `houseRefund`; stage 8 visuals.

## Decisions

- **Legality from the view.** `buildLegality` / `saleLegality` take `GameState`; `StateView` holds every `GameState` field except the secret `rng`, which neither helper reads. One adapter `game/houses.ts#houseControls(ctx, assetId)` passes the view to the helpers through a single documented narrowing (the view is first assigned to `Omit<GameState, 'rng'>`, so a missing field fails to compile) and returns `{ build: { enabled, code, reason, cost }, sell: { enabled, code, reason, refund } }`, or null for assets without controls. A parity test runs the helpers on core states and on their projections and asserts identical codes for every reachable code. `actionAvailability` leaves out the two per-asset commands. Alternatives: re-implementing the checks (forbidden: outcome computed locally) or widening the core signature (follow-up option for the Team Lead).
- **Cost and refund labels.** Team Lead ruling: no local `Q` arithmetic. game-core exports pure `houseCost(price)` = `Q(50% × price)` and `houseRefund(cost)` = `Q(50% × cost)`, used by `houses.ts` itself (legality funds check and the handler) and covered by a core unit test against `HouseBuilt.cost` / `HouseSold.refund`. The client labels call them; the scripted mock test checks them against the core events again.
- **Connection-level checks.** On top of the core code, a control is disabled while disconnected, while the same command type is pending, after the turn deadline, or for a non-participant / eliminated viewer, as for existing intents. These carry the existing generic reason texts.
- **Reason texts.** One English message per `HouseErrorCode` in a single map (`game/houses.ts`), reused for disabled controls and for rejected Acks with those codes (Team Lead ruling: English, consistent with existing strings). `GROUP_MORTGAGED` has a text but is unreachable until stage 5.
- **Build quota.** Handoff revision 2 (owner decision): the build quota resets at every turn, bonus included, in core (separate PR). The card shows "Builds left this turn" from `view.turn.quotas.builds` for the turn owner; the client never computes it.
- **Rent panel.** `RentPanel.vue` in GameScreen: shown while `view.rent` is non-null; payer, owner, asset, amount, energy dice sum; "Pay rent (amount → owner)" only for the payer, enabled under the usual turn/connection checks. The settlement does not disable EndTurn; while a settlement is open and EndTurn is available, the action area states that ending the turn pays the rent automatically.
- **Asset card.** Receives the current view (houses, quote, owner) so an open card updates. A fixed quote shows its amount. An energy quote shows the formula `Q(sumPrices × diceSum × holdings / (200 × groupSize))` filled with the quote's numbers, the rent for dice sums 2, 7 and 12 from `energyRentFor`, and, while the open settlement is on this asset, the settlement amount and dice sum. An unrounded per-point rate is not shown, because only `energyRentFor` may round. Nothing else is rounded locally.
- **House markers.** A separate Pixi layer refreshed from each view like the ownership layer, 1-4 small squares on the cell edge, independent of movement animation.
- **Rent animation.** `stepsForEvent` maps `RentPaid` with paid > 0 to a `{ kind: 'rentPayment', from, to, amount: paid }` step; the scene moves an amount label from payer token to owner token. Since `Welcome` never feeds the queue, reload skips it. A payment with paid = 0 (interim shortfall with empty balance) shows no motion.
- **Intents.** `sendCommand` takes a null-payload type by name or an `Intent` `{ type, payload }` whose payload type is derived from `CommandFrame`; the frame is built by spreading the intent, so no cast is needed around the protocol union. `BuildHouse` / `SellHouse` send `{ assetId }`, `PayRent` sends `null`, all with the projected turn target.
- **Mock.** The dev mock keeps its scripted dice and routes `PayRent`, `BuildHouse`, `SellHouse` and `EndTurn`/`Timeout`/`Resign` with an open settlement to the real core engine (mock-only import, as today). After a scripted move it opens a settlement priced by core `rentFor`, and refreshes `rentQuotes` with core `rentQuotes`. `MOCK_SCENARIO=stage4` seeds owners and houses for the first two seats and uses dice that reach logistics, doubled regular, regular and energy rent.

## Risks / Trade-offs

- Protocol v4 lands in TASK-s4-server: until it merges, `ClientCommandType` lacks the new commands. Develop against the server branch's protocol when available, else locally typed against main and rebase before typecheck/PR; never edit `packages/protocol` here or cast around it.
- The legality type narrowing could hide a future secret field the helpers start reading → the parity test and the narrowing's comment make that visible; the boundary test keeps the allowed value import list explicit.
- Screenshots need a browser → use the Playwright docker image only for evidence, not as a project dependency.

## Migration Plan

No persistence. Ships with protocol v4 / the stage 4 server; rebase on current main after TASK-s4-server merges. Screenshots stay in `/srv/agents/evidence/TASK-s4-client/`.
