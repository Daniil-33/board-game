# Proposal

## Why

Stage 2 movement and balances do not let players acquire assets. Stage 3 needs a deterministic purchase and auction core before the server and client adapters can expose ownership.

## What Changes

- **BREAKING**: support only `core-5`, with public `owners`, `purchase`, `auction` and `turn.pausedRemainingMs`.
- Offer purchase after free-asset landing and any lap reward, including interim jail release; owned assets remain inert.
- Add null-payload `BuyAsset`, `StartAuction`, `Bid`, `PassAuction`; compute fixed raises with `nextBidAmount` per D1 and reject unaffordable actions atomically.
- Run cyclic auctions with fresh `auctionResponse` targets, 10 s response deadlines, irreversible passes and derived leader reservation.
- Pause/resume turn time and defer end-turn/timeout closure until auction settlement; preserve existing bonus rules.
- Localize provisional E1 resignation behavior in `resignDuringPurchase` and resolution, with revision-3 bid history and previous-active-bid restoration, including the Team Lead-approved temporary eliminated paused-turn owner exception.

## Capabilities

### New Capabilities

- `engine/purchase-auction`: purchase decisions, ownership, fixed-raise auction lifecycle, reservation and deterministic recovery proof.

### Modified Capabilities

- `engine/game-lifecycle`: new initial fields, playing command set and core-5 version gate.
- `engine/turn-cycle`: landing offers, delayed closure and auction pause/resume.
- `engine/deadlines`: auction responses and suspended turn deadlines.
- `engine/economy`: purchase/auction debit reasons and landing settlement.
- `engine/projection`: public ownership, decisions, auctions and events.
- `engine/resignation`: provisional E1 decision cancellation, auction departure and deferred turn closure.

## Impact

Implementation is confined to game-core, its tests and engine OpenSpec deltas. Mechanical external fixture updates are allowed only for changed-type build failures and must be reported. No new dependencies. Protocol bump, migrations, UI, rent, construction, mortgage, debt, bankruptcy, trades, casino, chance and final jail rules are out of scope.

Sources: ROADMAP.md stage 3; GAME-BREAKDOWN.md sections «Покупка и аукцион», «Начальная настройка и деньги»; effort revision 2; TASK-s3-core revision 3 and TL design at PR #33 revision-3 head `b8d2e61`; Team Lead response approving E1 representation. E1 b1/c remain pending and gated on ROADMAP before merge. Approval and a fresh Apply context are required before product code changes.
