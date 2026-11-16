# Design

## Context

See proposal.md for motivation and sources. The worktree starts at `5bf02e9`; TL design/task revision 2 are supplied from TL-stage-3-design at PR #33 head `3605b2a`. The Team Lead response additionally approves deferred-resignation representation. These sources, not discarded revision 1 defaults, govern Apply.

Current `turns.ts` owns rolls and closeTurn; interim-jail release already moves via normal board movement. `rules.ts` dispatches Timeout through a targets guard derived from pendingDeadlines. `money.ts` only credits nonnegative deltas. State and event projection have exhaustive visibility maps. Session already supports deterministic replay, entropy and snapshot tails. The property generator only knows old turn commands and must learn decisions/auctions so it continues exercising turns.

## Goals / Non-Goals

Goals: preserve these integration points while adding the exact TL state and exported command contracts; centralize auction progression and provisional resignation policy; prove each task criterion deterministically.

Non-goals: no protocol bump, old-game migration or adapter behavior changes; no disposition of assets already owned by resigned participants (stage 5). No expansion of AuctionState or TurnState beyond the TL design.

## Decisions

### Modules and exports

Use a purchase-auction module for offer/open/bid/pass/advance/resolve and `nextBidAmount`, with state interfaces in state.ts. Keep `resignDuringPurchase` as a dedicated policy helper integrated with resignation.ts and the resolution path. Export PurchaseDecision, AuctionState, the four command types, their event types, `nextBidAmount`, and the auctionResponse target kind/duration through index.ts. Keep exact design field names and null payloads.

Retain closeTurn as the single normal/bonus/resigned closure path. Prefer having turns.ts orchestrate auction effects and close/resume returned outcomes to avoid a circular runtime dependency between the turn and purchase modules; do not duplicate bonus or successor logic in auction handlers. The alternative of a new phase or expanded reason enum is outside delegated state shape and unnecessary.

### Landing and money

Offer purchase after a move and any lap reward in both normal roll and interim-jail release branches, never on a failed jailed attempt or third-double jail transfer. Preserve automatic-roll continuation: it opens a purchase decision and sets the continuation deadline, rather than auctioning immediately.

Add a checked debit operation for purchase and auction rather than weakening creditBalance's positive-credit contract. Compute bid amounts using integer numerator arithmetic: 10 * floor(60 * price / 1000) and 10 * floor(5 * price / 1000). No independently stored reservation: derive it from leader and leadingBid. Validate before constructing replacement state; envelope/handler rejections leave state and RNG untouched. Existing accepted-command entropy absorption remains in the registry, not the new module.

### Progression and target freshness

Retain auction.order as the original rotated cyclic order, including subsequently eliminated participants; skip eliminated/passed/leader on every scan. This preserves successor order after resignation without a new field. Only replace responseId/deadline when the responder advances. Derive auction and response ids from the accepting revision with distinct prefixes; accepted command revisions and target kinds provide uniqueness without a mutable counter.

Pass and automatic pass share advancement. After a bid, advance past the new leader; after all opponents pass, debit and assign ownership exactly once. All-pass produces no debit. Each fresh slot is now + 10000. Resignation of an uninvolved opponent preserves the current response id/deadline unless it makes settlement due.

### Timer integration and error ordering

Set pausedRemainingMs = max(0, turn.deadline - now) when opening an auction. While auction exists, pendingDeadlines exposes only its auctionResponse. Player bid/pass requires now < responseDeadline; system Timeout requires now >= it. Resume a choice-origin turn at now + saved remainder, with the same id/quotas; other origins close via closeTurn. The expired original deadline remains stored but is not actionable while paused.

Keep Timeout's target guard derived from pendingDeadlines: a stale paused-turn Timeout consequently rejects TARGET_MISMATCH before its handler (consistent with existing engine/deadlines), while matching-target player turn handlers reject AUCTION_IN_PROGRESS. All satisfy the task's required rejection behavior. Validate malformed payloads and wrong actor/target/phase through established envelope ordering.

### Provisional E1 and invariant exception

`resignDuringPurchase` handles decision cancellation, non-leader pass, leader void and deferred owner departure. Existing resignation records elimination and removes order/position/jail; a game-ending resignation clears purchase/auction immediately before further auction work.

For continuing owner resignation, retain the paused turn temporarily with its eliminated playerId. Permit that exception only when auction is present and pausedRemainingMs non-null; order and positions still contain survivors only. Detect deferred resignation from eliminated.includes(turn.playerId), not a new flag. At resolve or void, scan retained auction.order after that owner for the first player still in state.order; call closeTurn with reason resigned and that nextPlayer, overriding origin and bonus. This also handles multiple departures and snapshot restoration. If the owner is leader, void and close immediately. CTO approval remains necessary before merge; future E1 changes stay localized in this helper, resolution and their tests.

### Projection and invariants

Initialize owners empty and purchase/auction null from genesis, and every new turn with pausedRemainingMs null. Classify all new state fields and events public. Extend checks for valid owner asset/participant ids, purchase position and owner, mutual exclusion, free auction asset, active eligible responder, positive quantized amounts, affordable leading bid and pause equivalence. Reject invalid restored shapes with existing invariant-error conventions. Use own-key-safe record operations, preserving arbitrary participant ids.

## Risks / Trade-offs

- Provisional E1 may change → keep policy isolated; block merge until the CTO decision is recorded in the effort handoff or ROADMAP.
- New mandatory landing choices change existing long-running tests → add explicit decision handling to helpers and generators while preserving the tested turn/jail semantics and coverage assertions.
- `core-5` affects version fixtures → update core fixtures; outside-core edits only for required changed-type build fixes and report each. If Compose seed behavior changes, record and re-pin test data per handoff, without adapter feature changes.
- Incorrect target/time restoration → mid-auction JSON snapshot plus tail checks compare full state and pendingDeadlines, including deferred resignation and responder replacement.

## Migration Plan

Core supports only core-5. Server migration and protocol version 3 belong to the sibling task, which starts after core merge. This PR must not advertise core-4 compatibility. No external operation during proposal. Before PR, rebase on current main and verify accepted source changes remain coherent. Archive this OpenSpec change in the PR only after independent review passes, then rerun required validation. No merge by the Engineer.

## Acceptance evidence plan

Task criteria 1–3: landing classes, lap reward ordering, owned assets, affordable/unaffordable buy, voluntary/EndTurn/timeout auction origins. Criteria 4–7 and 9: null payload, exact raises, all prices and 2..6 players, cyclic order, leader skipping, all-pass, single-winner, insufficient balance, deadline boundaries, wrong actor/target/phase, stale and duplicate response, AFK. Criterion 8: pause arithmetic, rejected conflicting commands and Timeout, continuation, bonus closure. Criteria 10–11: detached public projections and all E1 cases including immediate victory, leader-owner void, later successor departure. Criteria 12–14: focused tests, golden/property coverage with nonzero acquisition statistics, replay and mid-auction snapshot-tail equality. Run pnpm build, pnpm test, openspec validate --all --strict and git diff --check; require both CI jobs and independent review on the exact PR head before technical acceptance.

### Approved compatibility scope during Apply

The Team Lead approved test-only compatibility changes in `e2e/compose.spec.ts`,
`apps/server/src/__tests__/compose-fixture.test.ts` and the Compose override seed.
Existing browser flows wait for timeout-only auction passes and unsold settlement
before the next roll; they send no acquisition commands. Added timing derives from
continuation/response constants plus the existing Playwright expectation bound.
All movement, jail, AFK, recovery and victory assertions retain their meaning.
The shared seed is re-pinned from 4491 to 6689: four setup rolls followed by
[1,1], [4,4], [6,6] preserve the three-double jail scenario without an intervening
purchase. Client mock/test fixture fields are mechanical type compatibility only.
