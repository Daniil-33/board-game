# engine/resignation Specification

## Purpose
Defines voluntary permanent elimination during setup or play, preserving the surviving players' progress and declaring the last active participant the winner.

## Requirements

### Requirement: Voluntary resignation
`Resign` SHALL accept only player actors in `setup` or `playing`, with payload `null` and a current revision expectation. It SHALL accept an active participant regardless of whose turn or order roll it is and regardless of the deadline. A malformed payload SHALL reject with `INVALID_PAYLOAD`; an already eliminated participant SHALL reject with `PLAYER_ELIMINATED`. Rejections SHALL preserve state and randomness.

#### Scenario: Resign after deadline
- **WHEN** an active participant resigns at or after the current deadline with a current revision expectation
- **THEN** resignation SHALL be accepted without automatically rolling any dice

#### Scenario: Guard and actor validation
- **WHEN** resignation carries a stale revision, or a system actor, or a non-member player
- **THEN** it SHALL reject with the existing envelope error for the first failed check

#### Scenario: Malformed resignation
- **WHEN** a valid active player submits Resign with a non-null payload
- **THEN** it SHALL reject with INVALID_PAYLOAD and unchanged state and RNG

### Requirement: Permanent elimination
Acceptance SHALL retain the participant in `players`, append their id once to public `eliminated`, remove their position and jail entry, and emit `PlayerResigned { playerId }`. Eliminated players SHALL have no setup membership or turn order entry and SHALL be unable to perform further game actions. An eliminated player SHALL own a turn only temporarily while that turn is paused and an auction is present, pending resigned closure at auction resolution.

#### Scenario: Record resignation details
- **WHEN** an active participant resigns
- **THEN** the engine SHALL append eliminations {playerId, reason: 'resigned', at: context.now, creditorId: null} in eliminated order, remove the player from mortgage pending and invoke the no-op cancelOffersOf hook

#### Scenario: Prisoner resigns
- **WHEN** a participant with an own jail entry resigns
- **THEN** the entry and position SHALL be absent and the id SHALL be recorded as eliminated

#### Scenario: Repeated resignation
- **WHEN** an eliminated participant resigns again in setup or playing with a fresh command id and revision
- **THEN** it SHALL reject with PLAYER_ELIMINATED and no state or RNG changes

### Requirement: Resignation closes an owned turn
In playing, resigning on one's own turn SHALL drop any purchase decision and close it with `TurnEnded` reason `resigned`, cancel all bonus entitlement, and run mandatory settlement. During a running auction this closure SHALL be deferred until resolution; the paused turn SHALL retain the eliminated owner, with no bonus entitlement. Unless the game ends, the next surviving player in the previous cyclic order SHALL start a regular turn with fresh quotas, a fresh target and deadline `now + 45000`.

#### Scenario: Pending bonus canceled
- **WHEN** the owner resigns after rolling a double while at least two other players remain
- **THEN** events SHALL include PlayerResigned, TurnEnded with reason resigned, then TurnStarted for the next survivor with bonus false

#### Scenario: Unrolled or continued turn
- **WHEN** the owner resigns before rolling or during an automatic-roll continuation
- **THEN** the turn SHALL close without a dice roll or bonus turn

### Requirement: Other player's turn survives
In playing, resignation by a participant other than the turn owner SHALL remove the participant from the order without changing the current turn, its target, deadline, quotas or pending bonus, unless the game ends or auction departure requires advancing or resolving the auction. Auction completion SHALL apply its ordinary resume or close behavior unless the owner has resigned.

#### Scenario: Remove the next participant
- **WHEN** b resigns during a's turn in order [a, b, c]
- **THEN** the order SHALL be [a, c], a's turn SHALL be unchanged, and normal later advancement SHALL go to c

### Requirement: Setup resignation preserves surviving progress
Setup resignation SHALL remove the participant from every group, pending list and recorded roll, retaining survivor order and rolled values. Empty groups SHALL disappear. A resolved singleton SHALL require no further roll. Completed groups SHALL be ranked by surviving values; unresolved ties SHALL continue from the first unresolved group. If no unresolved group remains, play SHALL begin in the surviving order without extra dice draws.

#### Scenario: Already rolled participant resigns
- **WHEN** a participant with a recorded result resigns while others in that group remain pending
- **THEN** only their result and membership SHALL be removed and the surviving pending roller SHALL continue

#### Scenario: Collapse a tie group
- **WHEN** removal leaves a singleton in the group being rerolled and at least two active participants overall
- **THEN** that group SHALL resolve and the first unresolved group SHALL continue, or play SHALL begin if all groups are resolved

### Requirement: Setup roller replacement
When setup continues with a different current roller, resignation SHALL open a fresh never-reused setupRoll target for that roller with deadline `now + 45000` and emit OrderRollStarted. If the roller remains unchanged, its target and deadline SHALL be preserved.

#### Scenario: Current roller resigns
- **WHEN** the current roller resigns and their group still has pending surviving rollers
- **THEN** the next pending survivor SHALL receive a fresh setupRoll target and full deadline

#### Scenario: Another group disappears
- **WHEN** a resignation removes an earlier singleton group without changing the current roller
- **THEN** group indexing SHALL be corrected while the current target and deadline remain unchanged

### Requirement: Last active player wins
After any accepted resignation leaving exactly one active player, the game SHALL enter finished, set winner to that player, clear setup, turn, order, purchase and auction, set finishedAt to context.now, and emit GameEnded { winner, at, eliminations, finalBalances }, including every player balance. Terminal elimination SHALL skip lap processing. There SHALL be no pending deadlines or new turn. Remaining positions and jail entries, if any, SHALL describe only the winner.

#### Scenario: Win in setup
- **WHEN** one of the two remaining active participants resigns during setup
- **THEN** events SHALL include PlayerResigned then GameEnded, with no turn or pending deadline; a setup finish SHALL not create positions or perform order rolls

#### Scenario: Win on owner's turn
- **WHEN** the turn owner resigns leaving one active participant
- **THEN** events SHALL include PlayerResigned, TurnEnded with reason resigned, then GameEnded, with no TurnStarted

#### Scenario: Win on another player's turn
- **WHEN** a non-owner resigns leaving only the owner active
- **THEN** events SHALL include PlayerResigned then GameEnded and the owner's turn SHALL be cleared

### Requirement: Finished games reject further actions
The engine SHALL reject every new player command in finished without mutation or randomness consumption. Existing session command-id deduplication SHALL still return an earlier accepted result for an identical previously accepted command; it SHALL NOT execute it again.

#### Scenario: Commands after victory
- **WHEN** a player submits a new Resign, RollForOrder, RollDice or EndTurn after victory
- **THEN** the command SHALL reject and the finished state SHALL be unchanged

#### Scenario: Stale timeout after removal
- **WHEN** Timeout names a removed setupRoll or turn target, including after victory
- **THEN** it SHALL reject with TARGET_MISMATCH and unchanged state and RNG

### Requirement: Resignation replay and restoration
Given identical ordered commands, contexts and initial state, leave and resignation SHALL produce identical full state and events. Replaying the log or restoring a snapshot plus its tail across resignation and victory SHALL produce the same state and pending deadlines as the live session.

#### Scenario: Restore across resignation
- **WHEN** a snapshot before resignation is restored with a tail containing resignation and game end
- **THEN** full state, RNG, winner, events and pending deadlines SHALL match the live session
### Requirement: Provisional auction resignation policy
Resigning non-leaders SHALL count as passed and no longer respond. A resigning decision holder SHALL drop the decision without auction (provisional c default). A resigning auction turn owner SHALL defer resigned closure while any auction remains. Auction completion SHALL choose the next surviving player in pre-resignation cyclic order and cancel bonus entitlement.

#### Scenario: Non-leader responder resigns
- **WHEN** the current responder resigns without ending the game
- **THEN** they SHALL count as passed and the auction SHALL advance or resolve

#### Scenario: Another non-leader resigns
- **WHEN** an eligible player other than responder or leader resigns
- **THEN** they SHALL count as passed and the current response target and deadline SHALL survive unless settlement is now due

#### Scenario: Leader resigns
- **WHEN** the leader resigns without ending the game
- **THEN** the resigning leader SHALL pay nothing, the latest surviving bid SHALL lead again, and the current response target SHALL survive unless its responder is now the leader or settlement is due

#### Scenario: Decision holder resigns
- **WHEN** the purchase decision holder resigns
- **THEN** the decision SHALL disappear and no auction SHALL start

#### Scenario: Turn owner resigns during auction
- **WHEN** the non-leading turn owner resigns with at least two survivors
- **THEN** the auction SHALL continue among survivors and its paused turn SHALL temporarily retain the eliminated owner, then close as resigned with the next cyclic survivor and no bonus

#### Scenario: Successor also resigns
- **WHEN** the original successor resigns before the deferred auction resolves
- **THEN** closure SHALL select the next remaining survivor after the eliminated owner in the retained cyclic auction order

#### Scenario: Immediate victory overrides auction
- **WHEN** a resignation during a decision or auction leaves one active player
- **THEN** the game SHALL finish immediately, clear decision and auction, and leave no pending deadlines

### Requirement: Restore leadership after resignation
A resigning leader SHALL pay nothing. leaderAfterResignation SHALL scan bids backwards to restore the latest active bidder and its amount. With no surviving bid, leader and leadingBid SHALL be null and the next bid SHALL be startBid. The current response slot SHALL survive unless it belongs to the restored leader or settlement is due; advancement SHALL continue cyclically from that position.

#### Scenario: Restored passed bidder
- **WHEN** the selected earlier active bidder has already passed
- **THEN** the b1 default SHALL allow that bid to lead and win without removing the bidder from passed or granting another response

#### Scenario: No surviving earlier bid
- **WHEN** every recorded bidder is eliminated
- **THEN** the auction SHALL continue with no leader and the next bid SHALL be startBid

### Requirement: Resignation releases assets
Resignation SHALL delete all the resigner's owners, houses and mortgages and emit AssetsReleased {playerId, assetIds, reason: 'resigned'} in board order only when assetIds is non-empty. It SHALL leave their balance unchanged. R1/R2 SHALL continue dropping rent without payment when the payer or owner resigns. No eliminated player SHALL own assets, houses or mortgages.

#### Scenario: Release a portfolio
- **WHEN** a player resigns with houses and mortgaged assets
- **THEN** their portfolio SHALL become free with no refund or advance repayment and unrelated rent SHALL survive unless the game finishes

#### Scenario: Empty portfolio
- **WHEN** a participant with no assets resigns, including during setup
- **THEN** no AssetsReleased event SHALL be emitted

### Requirement: Elimination and finish validity
eliminations SHALL match eliminated in ids and order, recording reason, at and creditorId. finishedAt SHALL be non-null exactly in finished and SHALL use trusted transition time. Initial eliminations SHALL be empty and finishedAt SHALL be null.

#### Scenario: Recorded outcome
- **WHEN** resignation leaves one active player
- **THEN** its elimination timestamp and finish timestamp SHALL equal context.now, and final balances SHALL include eliminated players
