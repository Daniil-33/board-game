# Stage 3 purchase and auction: Team Lead technical design

Effort: `EFF-stage-3-purchase-auction`, handoff
`docs/efforts/stage-3-purchase-auction.md`. Revision 1 accepted by the Team
Lead on 2026-11-16 at main `66e9fc9`; revision 2 (owner decision D1)
accepted at main `5bf02e9`.

This document holds the technical decisions delegated to the Team Lead. It
does not change product behavior; rules come only from the handoff,
`ROADMAP.md` stage 3 and `GAME-BREAKDOWN.md` § "Покупка и аукцион". Numbered
criteria (C1..C14) refer to the handoff.

## Open product inputs

- **D1 (resolved by the owner, handoff revision 2): bid amount.** The first
  bid equals the start bid; every later bid is exactly the leading bid plus
  the step. A bid is a single raise action: `Bid` has payload `null` and the
  core computes the amount with `nextBidAmount(auction)` (= `startBid` with no
  leader, else `leadingBid + step`). The bid is rejected when that amount
  exceeds the responder's balance.
- **E1 (escalated to the CTO 2026-11-16): resignation during a decision or
  an auction.** Implemented behind one function `resignDuringPurchase` with
  the Team Lead recommendation: a non-leader resigning passes; a resigning
  leader voids the auction (no sale, asset free); a resigning decision holder
  drops the decision (no auction, asset free); if the turn owner resigns
  while its auction runs, the auction completes among the rest and the turn
  then closes as a resignation. A game ending by resignation drops any
  decision or auction. **The core PR does not merge until E1 is recorded (handoff revision or ROADMAP).**

## Delegated decisions

| Decision | Choice | Why |
|---|---|---|
| Rules version | `core-5`, sole supported version | New state, commands and timer semantics. |
| Protocol version | `PROTOCOL_VERSION = 3` | New commands and view fields. |
| Stage 2 stored games | Not supported; migration `0004` closes `lobby`/`playing` rooms, logs kept; same failure path as stage 2 | No production games; consistent with stage 2. |
| Decision commands guard | `turn` target (owner only) | The decision lives inside the turn. |
| Auction commands guard | `auctionResponse` target: a fresh id per response slot | Gives "id and revision" staleness (C10): a bid or pass for an earlier slot, or a duplicate, is rejected by the guard and never applies twice. |
| Timer pause | `turn.pausedRemainingMs: number \| null`; while non-null the turn deadline is not pending | One explicit field; `pendingDeadlines` stays the single host contract. |
| Reservation | Derived, not stored: the leader's reserved amount is `auction.leadingBid` | Cannot drift from the auction; stage 4+ spending checks use `available(player) = balance − reserved`. |

## Core (`packages/game-core`)

### State

```ts
interface GameState {
  // existing ...
  /** Owner of each owned asset, by assetId; absent = free. */
  readonly owners: Readonly<Record<string, PlayerId>>;
  /** Buy-or-auction decision of the turn owner; null when none. */
  readonly purchase: PurchaseDecision | null;
  /** The running auction; null when none. */
  readonly auction: AuctionState | null;
}
interface PurchaseDecision { readonly playerId: PlayerId; readonly cell: number; readonly assetId: AssetId }
interface AuctionState {
  readonly auctionId: string;            // never reused in a game
  readonly assetId: AssetId;
  readonly cell: number;
  readonly price: Money;                 // fixed price of the asset
  readonly startBid: Money;              // Q(60% × price)
  readonly step: Money;                  // Q(5% × price)
  readonly reason: 'choice' | 'end-turn' | 'timeout';
  readonly order: readonly PlayerId[];   // cyclic, starting with the landing player
  readonly passed: readonly PlayerId[];
  readonly leader: PlayerId | null;
  readonly leadingBid: Money | null;
  readonly responder: PlayerId;          // whose response is due
  readonly responseId: string;           // current auctionResponse target id
  readonly responseDeadline: Timestamp;  // now + 10 s
}
// TurnState gains: pausedRemainingMs: number | null
```

`startBid` and `step` use integer arithmetic: `Q(60·price/100)`,
`Q(5·price/100)`. Both are positive for every `prices-1` price (checked by a
test over the price table).

### Commands

| Command | Actor | Guard | Effect |
|---|---|---|---|
| `BuyAsset` | turn owner | `turn` | Allowed only with a pending decision and `balance ≥ price`; debit (`BalanceChanged reason 'purchase'`), set owner (`AssetPurchased`), clear decision. |
| `StartAuction` | turn owner | `turn` | Allowed with a pending decision (affordability irrelevant); pause turn; open auction with `reason 'choice'`. |
| `Bid` (payload `null`) | the `responder` | `auctionResponse` | Amount = `nextBidAmount(auction)`; rejected if above the responder's balance; becomes leader; advance responder. |
| `PassAuction` | the `responder` | `auctionResponse` | Add to `passed`; advance responder. |
| `Timeout` | system | `auctionResponse` | The responder passes (C5). |

Existing commands while a decision or auction exists:

- `EndTurn` with a pending decision opens the auction with `reason 'end-turn'`
  instead of closing; the turn closes after resolution (C3).
- Turn `Timeout` with a pending decision opens the auction with
  `reason 'timeout'`; the turn closes after resolution. (Before the roll the
  existing auto-roll applies; a landing from that roll opens a decision under
  the continuation deadline.)
- During an auction: `RollDice`, `EndTurn`, `BuyAsset`, `StartAuction` and the
  turn `Timeout` are rejected (`AUCTION_IN_PROGRESS`); the turn is paused and
  not pending (C8). `Resign` is handled by E1.

### Auction flow

- Open: `order` = active players in turn order rotated to start at the
  landing player; `responder` = first; `responseDeadline = now + 10 s`.
- Advance: the next player in `order` after the current responder who has not
  passed and is not the leader. If no such player exists the auction
  resolves.
- Resolve: leader exists → debit `leadingBid` (`BalanceChanged reason
  'auction'`), set owner (`AuctionWon`); otherwise `AuctionEndedUnsold`.
  Then: `reason 'choice'` → resume turn (`deadline = now +
  pausedRemainingMs`); `'end-turn' | 'timeout'` → `closeTurn` (bonus turn by
  existing rules).
- `pendingDeadlines`: during an auction only the `auctionResponse` deadline;
  otherwise as today.

Landing (any forward move, including the interim jail release move) on a free
asset after the lap reward opens the decision. Landing on an owned asset has
no effect (C9). The decision never survives `closeTurn`.

### Events

`PurchaseOffered`, `AssetPurchased`, `AuctionStarted`, `AuctionBid`,
`AuctionPassed { auto }`, `AuctionWon`, `AuctionEndedUnsold`, `TurnPaused`,
`TurnResumed`; `BalanceChanged` reasons gain `purchase` and `auction`. All
public.

### Invariants

- `owners`: keys are asset ids of the board, values are participants.
- `purchase` only in `playing`, for the turn owner, on a free asset cell equal
  to the owner's position; never together with `auction`.
- `auction` only in `playing`, for a free asset; `leadingBid` ≥ `startBid`
  and ≤ leader's balance; `responder` active, not passed, not leader;
  `turn.pausedRemainingMs` non-null exactly while an auction exists.
- Balances stay non-negative quanta.

### Projection

`owners`, `purchase`, `auction` (including `responseDeadline`) and every
balance are public (C11). No RNG data.

## Protocol (`packages/protocol`)

`PROTOCOL_VERSION = 3`. `Command.type` gains the four new types; all four
have payload `null` (the bid amount is computed by the core). The view stays
`Type.Unsafe<StateView>`. The server still sets `actor` from the session, so a
non-owner `Bid` is just a player command with the auction target.

## Server (`apps/server`)

- No new host contract: timers come from `pendingDeadlines`, so the 10 s
  response timer and the paused turn are handled by the existing arming.
- Restart and reload (C13): state (decision, auction, paused remainder) is in
  the snapshot/log; timers are re-armed from state on boot.
- Migration `0004` closes stage 2 rooms (policy above).
- Integration tests: a non-owner bid accepted through the socket; stale and
  duplicate bid rejected; restart during a decision and during an auction.

## Client (`apps/client`)

Functional only (C12): a Vue dialog for the landing player (Buy disabled when
unaffordable, Start auction); an auction panel for every viewer (asset, leading
bid and leader, responder, a 10 s timer from `responseDeadline`, passed
players; for the responder only: a Bid/Raise button showing the next amount
(disabled above own balance) and Pass); owner marker
on owned cells; owner line in the asset card; balances already live.

## Tasks and order

```
TASK-s3-core ──┬─> TASK-s3-server (protocol + server) ──┐
               └─> TASK-s3-client ──────────────────────┴─> TASK-s3-e2e
```

`TASK-s3-core` starts now and may complete review before E1 is recorded; its
merge waits for E1. Server and client start from the core branch head
only after the core merges (no stacking on unmerged branches). At most two
Engineers at once. Learned from stage 2: the client PR updates its own
protocol-version fixtures to follow `PROTOCOL_VERSION`, and whichever of
server/client merges second rebases.

## Evidence plan

Per task: green CI on the exact head, independent review, focused checks.
Effort completion (handoff list): 3-client Playwright for buy, decline →
auction won by another, unsold auction, AFK pass after 10 s, turn deadline →
auction → close, over-balance bid rejected, reload and server restart during
an auction; core replay tests; `openspec validate --all --strict`; green CI
on final `main`; `ROADMAP.md` "Сделано".
