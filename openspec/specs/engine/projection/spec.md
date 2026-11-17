# engine/projection Specification

## Purpose
Defines what each client-side viewer may see of the authoritative game state and of the events a transition produces, so that a host can send game data to players and spectators without leaking secrets such as the RNG state.

## Requirements

### Requirement: Viewers
A viewer SHALL be either a player viewer carrying a `PlayerId` or a spectator viewer carrying no player identity. A player viewer whose `PlayerId` is not a member of the game SHALL be treated as a spectator.

#### Scenario: Non-member player viewer
- **WHEN** state is projected for a player viewer whose `PlayerId` is not in the game
- **THEN** the projection SHALL be deep-equal to the projection for a spectator viewer

### Requirement: State projection hides secrets
Projecting a game state for any viewer SHALL return a view that contains no RNG state, in any phase. Every other field of the current state (revision, rules version, phase, players, order-roll state, turn order, current turn, positions, interim jail entries, eliminated ids, winner, board, economy, balances, owners, purchase and auction) SHALL be present in the view with the same value as in the state.

#### Scenario: RNG never projected
- **WHEN** a state in phase `lobby`, `setup`, `playing` or `finished` is projected for a player viewer and for a spectator viewer
- **THEN** neither view SHALL contain the RNG state or any of its words

#### Scenario: Public fields projected
- **WHEN** a state is projected for any viewer
- **THEN** the view SHALL carry the state's revision, rules version, phase, players, order-roll state, turn order, current turn, positions, jail entries, eliminated ids, winner, board, economy, balances, owners, purchase and auction unchanged

### Requirement: Projection is plain data
A state view and a projected event list SHALL be plain JSON-compatible data. Projecting SHALL NOT mutate the state or the events, and SHALL return the same view for the same inputs.

#### Scenario: View survives serialization
- **WHEN** a projected view is serialized to JSON and parsed back
- **THEN** the result SHALL be deep-equal to the view

#### Scenario: Projection is pure
- **WHEN** the same state is projected twice for the same viewer
- **THEN** both views SHALL be deep-equal and the state SHALL be unchanged

### Requirement: Every state field is classified
Every field of the game state SHALL have an explicit visibility classification, either public or secret. Adding a state field without a classification SHALL fail type-checking of `packages/game-core`.

#### Scenario: Unclassified field
- **WHEN** a field is added to the game state type without adding its visibility classification
- **THEN** `tsc --noEmit` for `packages/game-core` SHALL fail

### Requirement: Event projection fails closed
Projecting events for a viewer SHALL keep their order and return each event the viewer may see. Every acquisition event, BoardGenerated and BalanceChanged and every lifecycle event (`GameCreated`, `PlayerAdded`, `GameStarted`) and every order-roll, turn, interim-jail, leave, resignation and game-end event SHALL be visible to every viewer unchanged. An event whose type has no visibility classification SHALL raise an engine-defect error rather than be passed through.

#### Scenario: Lifecycle events are public
- **WHEN** the events of `CreateGame`, `AddPlayer` and `StartGame` are projected for a spectator viewer
- **THEN** the projected list SHALL be deep-equal to the original events, in the same order

#### Scenario: Turn events are public
- **WHEN** the events of a seeded game through setup and several turns are projected for a spectator viewer
- **THEN** every projected list SHALL be deep-equal to the original events

#### Scenario: Unknown event type
- **WHEN** an event list containing an event type with no visibility classification is projected
- **THEN** projection SHALL raise an error naming that event type and return no list

#### Scenario: Resignation and victory visible to everyone
- **WHEN** PlayerLeftLobby, PlayerResigned and GameEnded events are projected for participants, eliminated participants and spectators
- **THEN** every projected list SHALL preserve the original events and their object payloads in order

#### Scenario: Acquisition events are public
- **WHEN** PurchaseOffered, AssetPurchased, AuctionStarted, AuctionBid, AuctionPassed (including auto), AuctionWon, AuctionEndedUnsold, TurnPaused and TurnResumed are projected
- **THEN** every viewer SHALL receive the unchanged events in their original order

### Requirement: Public acquisition data is detached
All viewers SHALL receive detached ownership, purchase and complete auction data, including order, passed players, leading bid, responder, response id and deadline, together with pausedRemainingMs and balances. No RNG data SHALL be exposed.

#### Scenario: Spectator and eliminated player
- **WHEN** a running auction is projected for a spectator and an eliminated participant
- **THEN** both SHALL see identical acquisition data and mutating a returned view SHALL not mutate authoritative state

### Requirement: Public rent and houses
Every viewer SHALL receive detached houses, rent and rentQuotes along with all balances. Each owned asset SHALL have a quote: {kind: 'fixed', amount} or {kind: 'energy', sumPrices, groupSize, holdings}. Resigned owners and mortgaged assets SHALL quote fixed zero. rentFor and energyRentFor SHALL be exported pure display helpers.

#### Scenario: Energy quote
- **WHEN** an active owner has a non-mortgaged energy asset
- **THEN** its quote SHALL contain exact sumPrices, groupSize and non-mortgaged holdings, and energyRentFor(quote,diceSum) SHALL reproduce landing rent

#### Scenario: Detached public data
- **WHEN** a player, spectator or eliminated participant projects state and changes the returned data
- **THEN** all SHALL originally see identical houses, rent and quotes and authoritative state SHALL remain unchanged

### Requirement: Rent and house events are public
RentDue, RentPaid, HouseBuilt and HouseSold, and BalanceChanged with reasons rent, build and house-sale SHALL be visible unchanged to every viewer in event order.

#### Scenario: Settlement and construction events
- **WHEN** any new rent or house event is projected
- **THEN** all viewers SHALL receive detached copies in the original order

### Requirement: Public mortgages and results
Every viewer SHALL receive detached public mortgages with advance, lapsCompleted, remainingLaps = 8 - lapsCompleted and pending; eliminations and finishedAt SHALL be public. In finished, result SHALL contain winner, finishedAt, eliminations and finalBalances for every player. Outside finished result SHALL be null. RNG SHALL remain secret.

#### Scenario: Reload a result or mid-term mortgage
- **WHEN** a player, eliminated player or spectator projects restored state
- **THEN** all SHALL see identical detached mortgage terms and elimination records and the finished result when applicable

### Requirement: Public mortgage and asset release events
AssetMortgaged, AssetRedeemed, MortgageExpired, AssetsReleased and enriched GameEnded SHALL be public, with mortgage and redeem BalanceChanged reasons public. Event order SHALL remain unchanged and all returned data SHALL be detached.

#### Scenario: Project lifecycle events
- **WHEN** the mortgage, release and end events are projected for any viewer
- **THEN** the full event payloads SHALL be preserved in order without sharing mutable data with authoritative state

### Requirement: Public debt settlement events
LiquidationApplied and PlayerBankrupt SHALL be classified public and exported as core event contracts. Every viewer, including eliminated players and spectators, SHALL receive detached full payloads in event order, together with automatic mortgage and house sale events, balance changes and the enriched game end result.

#### Scenario: Liquidation and bankruptcy visible to all
- **WHEN** liquidation or bankruptcy events are projected for a player, eliminated player or spectator
- **THEN** all SHALL receive equal ordered payloads, and mutating a projected payload SHALL not change authoritative events
