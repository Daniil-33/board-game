# Design

## Context

The archived `game-dialogs` change supplies the established responsive dialog and auction content. Review findings RVW-007 and RVW-008 call for persistent non-modal visibility and synchronized browser clients; RVW-501 calls for restoring a lost exclusivity/source qualifier in the canonical spec. The task handoff adds the logistics schedule count correction.

## Decisions

- Render the purchase `ResponsiveDialog` only when the local viewer is the non-eliminated deciding player. Render everyone else a live `role="status"` surface with decider, asset, price, and countdown.
- Place the inline purchase status before the board column so it remains in the initial viewport.
- On mobile, render the auction `ResponsiveDialog` only while the local viewer is its non-eliminated responder. Render the existing `AuctionContent` inline for all other viewers on both viewport classes. Preserve reopening when a viewer becomes responder.
- Compute logistics schedule rows from the number of assets in the logistics group, capped by the shared rent percentage schedule. Keep `rentFor` and quote behavior unchanged.
- In `resolvePrompts` and `endTurn`, take the acting client's post-action revision and wait for every client to reach it. Avoid reading the host's view as the expected revision after another actor acts.
- Restore “using only the current server board and projection” in the canonical Asset inspection statement.

## Risks

- Responsive dialog presence depends on the projected viewer identity and elimination state; tests must cover bystander and eliminated viewers, as well as the locked responder.
- Rent tiers must remain parity-compatible with `rentFor`; tests cover all available logistics holdings for each generated board.
- E2E revision synchronization must use the action actor's view because the host can be a bystander.

## Non-Goals

No command, timer, amount, legality, protocol, server, StateView, sound, or unrelated core behavior changes.
