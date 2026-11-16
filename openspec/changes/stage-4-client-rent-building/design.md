# Design

## Context

See proposal.md and TASK-s4-client revision 1. The game screen already has a shared 250 ms clock, pending command types, a name resolver, Ack error messages, `canIssue` / `actionAvailability` selectors in `game/view.ts`, an `AnimationQueue` fed by `Update` events, an ownership layer in `BoardScene`, and an informational `AssetCard`. The client command union and `PROTOCOL_VERSION` belong to `@game/protocol`, which TASK-s4-server changes in parallel.

## Goals / Non-Goals

Goals: render stage 4 projection fields and send the three new intents, keeping the view as the only source of state.
Non-goals: computing rent, cost, refund, shortfall or legality outside the shared core helpers; protocol/core/server edits; stage 8 visuals.

## Decisions

- **Legality from the view.** `buildLegality` / `saleLegality` take `GameState`; `StateView` holds every `GameState` field except the secret `rng`, which neither helper reads. One adapter `game/houses.ts#houseControls(view, me, assetId)` passes the view to the helpers through a single documented type narrowing and returns `{ build: { cost, error }, sell: { refund, error } }`. A parity test runs the helpers on real core states and on their projections and asserts identical codes for every reachable code. Alternatives: re-implementing the checks (forbidden: outcome computed locally) or widening the core signature (a core change, out of scope; noted as a follow-up for the Team Lead).
- **Cost and refund labels.** Cost is `Q(50% × price)` and refund `Q(50% × cost)` per the handoff; core exports no display helper for them. The labels use the exported `Q` with integer arithmetic exactly as the core does (`Q(price / 2)`, `Q(cost / 2)`), checked against core `HouseBuilt.cost` / `HouseSold.refund` in a test. If the Team Lead prefers a core helper, that is a core change for a follow-up.
- **Connection-level checks.** On top of the core code, a control is disabled while disconnected, while the same command type is pending, after the turn deadline, or for a non-participant / eliminated viewer, as for existing intents. These carry the existing generic reason texts.
- **Reason texts.** One English message per `HouseErrorCode` in a single map (`game/houses.ts`), reused for disabled controls and for rejected Acks with those codes. The handoff says "Russian UI text, consistent with existing strings", but every existing client string is English; this proposal keeps English for consistency and asks the Team Lead to confirm.
- **Rent panel.** `RentPanel.vue` in GameScreen: shown while `view.rent` is non-null; payer, owner, asset, amount, energy dice sum; "Pay rent (amount → owner)" only for the payer, enabled under the usual turn/connection checks. The settlement does not disable EndTurn; while a settlement is open and EndTurn is available, the action area states that ending the turn pays the rent automatically.
- **Asset card.** Receives the current view (houses, quote, owner) so an open card updates. A fixed quote shows its amount. An energy quote shows the formula `Q(sumPrices × diceSum × holdings / (200 × groupSize))` filled with the quote's numbers, the rent for dice sums 2, 7 and 12 from `energyRentFor`, and, while the open settlement is on this asset, the settlement amount and dice sum. An unrounded per-point rate is not shown, because only `energyRentFor` may round. Nothing else is rounded locally.
- **House markers.** A separate Pixi layer refreshed from each view like the ownership layer, 1-4 small squares on the cell edge, independent of movement animation.
- **Rent animation.** `stepsForEvent` maps `RentPaid` with paid > 0 to a `{ kind: 'rentPayment', from, to, amount: paid }` step; the scene moves an amount label from payer token to owner token. Since `Welcome` never feeds the queue, reload skips it. A payment with paid = 0 (interim shortfall with empty balance) shows no motion.
- **Intents.** `sendCommand(type, payload?)` forwards the protocol's payload type; `BuildHouse` / `SellHouse` send `{ assetId }`, `PayRent` sends `null`, all with the projected turn target. No cast around the protocol union.
- **Mock.** The dev mock runs the real core engine (mock-only import, as today) and gains a deterministic script that lands on owned assets and reaches a complete group, so rent, auto-pay, build, illegal build and sell can be exercised and screenshotted.

## Risks / Trade-offs

- Protocol v4 lands in TASK-s4-server: until it merges, `ClientCommandType` lacks the new commands. Develop against the server branch's protocol when available, else locally typed against main and rebase before typecheck/PR; never edit `packages/protocol` here or cast around it.
- The legality type narrowing could hide a future secret field the helpers start reading → the parity test and the narrowing's comment make that visible; the boundary test keeps the allowed value import list explicit.
- Screenshots need a browser → use the Playwright docker image only for evidence, not as a project dependency.

## Migration Plan

No persistence. Ships with protocol v4 / the stage 4 server; rebase on current main after TASK-s4-server merges. Screenshots stay in `/srv/agents/evidence/TASK-s4-client/`.
