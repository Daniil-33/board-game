# engine/purchase-auction Specification

## Purpose

Defines deterministic asset acquisition through landing decisions and cyclic fixed-raise auctions, including reservation and replayable settlement.

## Requirements

### Requirement: Free asset landing decision
Landing on a free monopoly, logistics or energy asset SHALL offer purchase to the landing player after movement and any lap reward, including jail release. Purchase and auction SHALL be mutually exclusive. An owned asset SHALL have no landing effect.

#### Scenario: Lap reward before offer
- **WHEN** forward movement crosses start and lands on a free asset
- **THEN** PurchaseOffered SHALL follow PlayerMoved and the lap-reward BalanceChanged

#### Scenario: Owned asset or jail release
- **WHEN** movement lands on an owned asset or a jail release lands on a free asset
- **THEN** the former SHALL create no decision and the latter SHALL create a purchase decision

### Requirement: Purchase commands
BuyAsset and StartAuction SHALL require null payload, the current turn target, its active owner and a pending decision, strictly before the turn deadline. BuyAsset SHALL debit the fixed price, set the owner and clear the decision only if affordable. StartAuction SHALL be allowed regardless of affordability.

#### Scenario: Affordable purchase
- **WHEN** the decision holder buys with balance at least the price
- **THEN** the price SHALL be debited with reason purchase, AssetPurchased emitted and the decision cleared

#### Scenario: Unaffordable purchase
- **WHEN** the decision holder cannot afford the fixed price
- **THEN** BuyAsset SHALL reject unchanged but StartAuction SHALL remain available

### Requirement: Cyclic auction opening
Opening an auction SHALL clear purchase, rotate active turn order to the landing player, and give that player the first response. Start bid SHALL be 10 × floor(60 × price / 1000) and step 10 × floor(5 × price / 1000), both positive for every prices-1 price. Auction and response target ids SHALL never be reused.

#### Scenario: Supported player counts and prices
- **WHEN** auctions open for each player count 2 through 6 and each supported price
- **THEN** every active player SHALL appear once in cyclic order and both amounts SHALL be positive integer quanta

### Requirement: Fixed raise and reservation
Bid SHALL carry null payload and compute exactly startBid with no leader, otherwise leadingBid + step. A computed amount exceeding the responder's balance SHALL reject unchanged. An accepted bid SHALL append {playerId, amount} to auction.bids in order and replace the leader and leadingBid; that bid SHALL be the leader's derived reservation until outbid or settlement.

#### Scenario: First and subsequent bids
- **WHEN** successive responders bid
- **THEN** the first amount SHALL equal startBid and each next amount SHALL equal the preceding bid plus step

#### Scenario: Over-balance or malformed bid
- **WHEN** the computed amount exceeds balance or Bid carries an explicit amount payload
- **THEN** the command SHALL reject without consuming RNG or changing state

### Requirement: Response authorization and timing
Bid and PassAuction SHALL require the current auctionResponse target and its active responder, strictly before responseDeadline. A system Timeout with null payload at or after that deadline SHALL pass automatically. Passes SHALL be irreversible; advance SHALL skip passed, eliminated and leading players and give each new responder 10 000 ms.

#### Scenario: Leader skipped and pass permanent
- **WHEN** a response advances cyclically past a leader or passed participant
- **THEN** neither SHALL become responder and the next eligible opponent SHALL receive a fresh response target

#### Scenario: Boundary and stale response
- **WHEN** a response arrives at its deadline, before its timeout deadline, or for an earlier slot
- **THEN** late player response, early Timeout and stale response SHALL respectively reject without mutation

#### Scenario: AFK pass
- **WHEN** the responder does not act for 10 seconds and the host submits Timeout
- **THEN** AuctionPassed SHALL report auto true and advance or resolve the auction

### Requirement: Auction settlement
When no non-passed opponent remains, the leader SHALL pay leadingBid and own the asset, emitting BalanceChanged reason auction then AuctionWon. With no leader the asset SHALL stay free and AuctionEndedUnsold SHALL be emitted. Settlement SHALL clear auction and its reservation exactly once and resume or close the turn according to its origin or deferred resignation.

#### Scenario: Single bid wins or all pass
- **WHEN** all opponents of one bidder pass, or all players pass without bidding
- **THEN** the former SHALL debit only the winner and assign ownership and the latter SHALL leave balances and ownership unchanged

#### Scenario: Duplicate settlement response
- **WHEN** the final response is delivered again
- **THEN** session deduplication SHALL return its original result without another debit, and a fresh command against its expired target SHALL reject

### Requirement: Ownership invariants
Owner keys SHALL name board asset ids and values SHALL name participants. Purchase SHALL exist only during playing for the active turn owner at their current free asset. Auction SHALL exist only during playing for a free asset with an active eligible responder and an affordable leader bid. Balances SHALL remain non-negative integer quanta.

#### Scenario: Corrupt acquisition state
- **WHEN** invariant checking encounters an unknown owner asset, conflicting decision and auction, ineligible responder or unaffordable leader
- **THEN** it SHALL raise an invariant violation

### Requirement: Acquisition replay and snapshot restoration
Identical ordered inputs SHALL reproduce acquisition state, events and RNG exactly. Restoring a mid-decision or mid-auction snapshot with its tail SHALL reproduce full live state and pendingDeadlines, including response ids and paused time.

#### Scenario: Mid-auction restoration
- **WHEN** a snapshot after a bid is restored with passes, timeouts and settlement in its tail
- **THEN** restored state, events and pending deadlines SHALL equal live execution

### Requirement: Bid history consistency
Auction bids SHALL be append-only accepted positive quantum amounts with participant ids. The leader and leadingBid SHALL equal the latest surviving bid selected by leaderAfterResignation.

#### Scenario: Mismatched history
- **WHEN** restored auction leadership differs from the latest surviving bid in its history
- **THEN** invariant checking SHALL raise an invariant violation
