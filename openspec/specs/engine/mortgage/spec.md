# engine/mortgage Specification

## Purpose

Defines deterministic asset mortgages, redemption and collective-lap expiry with persisted terms that survive replay and restoration.

## Requirements

### Requirement: Mortgage state
State SHALL contain mortgages keyed by asset id, each with advance, lapsCompleted and pending. isMortgaged SHALL test own-key presence. Advance SHALL equal Q(50% price), lapsCompleted SHALL be an integer 0..7 and pending SHALL contain unique active order members. Mortgages SHALL belong to active owners and have no houses.

#### Scenario: Genesis and validity
- **WHEN** a game is created or restored
- **THEN** mortgages SHALL start empty or pass these invariants, and invalid mortgage state SHALL raise an invariant violation

### Requirement: Mortgage command validation
Mortgage and Redeem SHALL accept exactly {assetId: string}, use a turn guard and require playing with a player actor. After envelope checks, validation SHALL check payload, auction pause, turn ownership, deadline, then legality. Rejection SHALL preserve state, revision and RNG.

#### Scenario: Validation precedence
- **WHEN** an asset command has malformed payload, an auction pause, a wrong turn actor, an expired deadline or an illegal asset
- **THEN** the first applicable check SHALL return INVALID_PAYLOAD, AUCTION_IN_PROGRESS, NOT_ACTIVE_PLAYER, DEADLINE_PASSED or the legality code in that order

### Requirement: Taking a mortgage
Mortgage SHALL require no purchase decision, an asset owned by the actor, no existing mortgage and no houses on that asset. Failures SHALL return DECISION_PENDING, NOT_AN_ASSET, NOT_OWNER, ALREADY_MORTGAGED or HAS_HOUSES respectively. An own open rent SHALL be allowed. It SHALL credit Q(50% price) with reason mortgage and emit AssetMortgaged {playerId, assetId, advance, auto: false}.

#### Scenario: Houses on siblings
- **WHEN** the owner mortgages the zero-house asset of a group with houses [1,1,0]
- **THEN** the command SHALL succeed, preserve sibling houses and create {advance, lapsCompleted: 0, pending: current order}

#### Scenario: Mortgage during rent
- **WHEN** the payer mortgages a legal asset during their own rent
- **THEN** the rent amount SHALL remain fixed and the advance SHALL be available for payment

### Requirement: Redemption
Redeem SHALL require no purchase or rent, an asset owned by the actor, a mortgage and cash covering its stored advance. Failures SHALL return DECISION_PENDING, RENT_PENDING, NOT_AN_ASSET, NOT_OWNER, NOT_MORTGAGED or INSUFFICIENT_FUNDS in that order. It SHALL debit the stored advance with reason redeem, delete the mortgage and emit AssetRedeemed {playerId, assetId, amount}.

#### Scenario: Redeem or reject during rent
- **WHEN** an owner redeems with enough money outside rent, or attempts redemption during rent
- **THEN** redemption SHALL restore rent eligibility in the first case and reject RENT_PENDING without mutation in the second

### Requirement: Shared pure helpers
The core SHALL export mortgageLegality, redeemLegality and mortgageAdvance for client use. The legality helpers SHALL return the handlers' legality codes without time checks or mutation; mortgageAdvance SHALL return Q(50% price) using integer arithmetic.

#### Scenario: Display and execution agree
- **WHEN** legality is evaluated and the same command is submitted by the owner before deadline with a valid envelope
- **THEN** its legality rejection or acceptance SHALL agree with the helper

### Requirement: Collective lap processing
At each nonterminal closeTurn boundary after mandatory settlement and TurnEnded, mortgages SHALL be visited in board order. Remove the closing player from pending; if empty, increment lapsCompleted and reset pending to current order. Every closed turn counts, including bonus, jail and sent-to-jail turns; already absent players make no extra progress within that lap.

#### Scenario: Mid-lap mortgage and bonus turns
- **WHEN** a mortgage is taken during a turn in a two- or three-player game
- **THEN** pending SHALL initially include all active players and that current turn's closure SHALL count; repeated closures by an already absent player SHALL not complete the lap

### Requirement: Elimination and expiry boundaries
Elimination SHALL remove the player from all mortgage pending lists immediately; an empty list SHALL complete only at the next turn boundary. Reaching eight laps SHALL delete ownership and mortgage, retain the advance and emit MortgageExpired {playerId, assetId, advance} after TurnEnded and before TurnStarted. Terminal elimination SHALL perform no lap processing.

#### Scenario: Exactly eight laps
- **WHEN** seven laps and a partial eighth have closed
- **THEN** ownership SHALL remain until the eighth completes, then expiry events SHALL follow board order and balances SHALL be unchanged by expiry

#### Scenario: Resignation empties pending
- **WHEN** a non-owner resigns leaving pending empty without ending the game
- **THEN** no expiry SHALL occur until the next turn boundary, including a boundary deferred by an auction

### Requirement: Mortgage replay and restore
Identical ordered commands and contexts SHALL reproduce mortgage state and events. Restoring a mid-term snapshot and its tail SHALL reproduce live mortgages, expiry, public views and pending deadlines.

#### Scenario: Replay the mortgage lifecycle
- **WHEN** a log includes taking a mortgage, redeeming it, taking another and letting it expire
- **THEN** full replay and mid-term restoration SHALL equal live state and events
