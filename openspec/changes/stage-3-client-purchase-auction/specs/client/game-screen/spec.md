## ADDED Requirements

### Requirement: Purchase decision display
While view.purchase exists, the landing viewer SHALL see a Vue dialog with asset, fixed price, own balance, Buy and Start auction. Buy SHALL be disabled below price. Other viewers SHALL see who is deciding. Controls SHALL require connection, an active viewer, an unexpired turn deadline and no same-type pending command.

#### Scenario: Affordable and unaffordable purchase
- **WHEN** the deciding viewer's balance is equal to the price or below it
- **THEN** Buy SHALL respectively be enabled or disabled and Start auction SHALL remain available subject to command availability

#### Scenario: Other viewer
- **WHEN** another participant or an eliminated viewer sees the pending decision
- **THEN** they SHALL see the deciding player's name without purchase controls

### Requirement: Auction participation display
While view.auction exists every viewer SHALL see asset, start bid, step, leading amount and leader, passed players, responder and responseDeadline minus current time in seconds rounded up and clamped at zero. Only the active responder SHALL get Bid and Pass controls, subject to connection, pending command and response deadline checks.

#### Scenario: Next bid and affordability
- **WHEN** the responder sees an auction with no leader or with a leading bid
- **THEN** Bid SHALL show startBid or leadingBid plus step respectively and SHALL be disabled when that amount exceeds their projected balance

#### Scenario: Other participants and spectators
- **WHEN** a non-responder or eliminated viewer sees the auction
- **THEN** the panel SHALL be read-only

#### Scenario: Resignation restores a leader
- **WHEN** an Update containing only PlayerResigned changes the projected leader, leading bid, responder or passed list
- **THEN** the panel SHALL display the new projection and next bid without deriving auction state from events

#### Scenario: Timeout and settlement
- **WHEN** the response deadline passes locally
- **THEN** the timer SHALL show zero without locally passing anyone or closing the auction; a later view SHALL determine the displayed outcome

### Requirement: Projected owner markers
Owned asset cells SHALL show a PixiJS marker in the owner's player colour, distinct from the group marker. Ownership SHALL come only from view.owners and SHALL refresh on each authoritative view independently of movement animations.

#### Scenario: Owner changes without board regeneration
- **WHEN** a new view changes ownership while the generated board stays identical
- **THEN** the cell marker SHALL refresh to the new owner's colour

### Requirement: Purchase and auction intents
Purchase and auction controls SHALL send null-payload intents through the existing protocol connection. Purchase intents SHALL target the projected turn; Bid and PassAuction SHALL target the projected auction responseId. Ack errors SHALL remain visible and accepted Acks SHALL NOT locally change ownership or settle an auction.

#### Scenario: Rejected stale bid
- **WHEN** the server rejects a bid with an Ack error
- **THEN** the error code and message SHALL be shown and the client SHALL retain the latest projected auction

## MODIFIED Requirements

### Requirement: Timer from the server deadline
While `turn.pausedRemainingMs` is non-null the turn timer SHALL show "paused". Otherwise the timer SHALL show the time left until the view's deadline
(`setup.deadline` in phase `setup`, `turn.deadline` in phase `playing`),
computed as the deadline minus the current time and never below zero. It
SHALL NOT count down from a local fixed duration. When the view's deadline
changes the timer SHALL follow it.

#### Scenario: Mid-turn reconnect
- **WHEN** a view arrives whose turn deadline is 12 400 ms after the current time
- **THEN** the timer SHALL show 13 s, not 45 s

#### Scenario: Continuation
- **WHEN** an update replaces the turn deadline with one 20 000 ms ahead
- **THEN** the timer SHALL show 20 s

#### Scenario: Past deadline
- **WHEN** the current time is after the deadline
- **THEN** the timer SHALL show 0 s


#### Scenario: Paused turn
- **WHEN** the view supplies a non-null paused remainder during an auction
- **THEN** the turn timer SHALL show "paused", regardless of the old deadline

### Requirement: Action buttons follow the view
`RollForOrder` SHALL be enabled only in phase `setup` when the viewer is
`setup.playerId`. `RollDice` SHALL be enabled only in phase `playing` when
the viewer is `turn.playerId` and `turn.rolled` is false. `EndTurn` SHALL be
enabled only in phase `playing` when the viewer is `turn.playerId` and
`turn.rolled` is true. RollDice and EndTurn SHALL be disabled while view.auction exists. Every button SHALL be disabled while disconnected,
while a command of its type is pending, and once the deadline has passed.

#### Scenario: Not my turn
- **WHEN** the view's `turn.playerId` is another player
- **THEN** RollDice and EndTurn SHALL be disabled

#### Scenario: Before and after the roll
- **WHEN** it is the viewer's turn with `rolled: false`, then with `rolled: true`
- **THEN** first only RollDice SHALL be enabled, then only EndTurn

#### Scenario: My order roll
- **WHEN** the phase is `setup` and `setup.playerId` is the viewer
- **THEN** only RollForOrder SHALL be enabled

#### Scenario: Pending command
- **WHEN** the viewer pressed RollDice and its `Ack` has not arrived
- **THEN** RollDice SHALL be disabled


#### Scenario: Auction in progress
- **WHEN** the turn owner views an ongoing auction
- **THEN** RollDice and EndTurn SHALL be disabled

### Requirement: Asset inspection
Clicking an asset cell SHALL open a Vue card showing its projected company name, category, group, monopoly rank when present, price, owner name or "free", and other group members with their prices and cell indices. A close control or Escape SHALL close the card. Clicking a non-asset cell SHALL open no card. The card SHALL use the current server board only and SHALL offer no asset actions.

#### Scenario: Monopoly details
- **WHEN** a player clicks a monopoly asset
- **THEN** its card SHALL show company, category, group, rank, price and all other assets with the same groupId and their prices and cells

#### Scenario: Logistics and energy details
- **WHEN** a logistics or energy asset is selected
- **THEN** its card SHALL show its projected category, group, price, owner name or "free", and other group members without inventing a monopoly rank

#### Scenario: Dismiss card
- **WHEN** an open card receives Escape or its close control is clicked
- **THEN** the card SHALL close

#### Scenario: Special cell click
- **WHEN** no card is open and a non-asset cell is clicked
- **THEN** no card SHALL open

#### Scenario: Ownership changes
- **WHEN** a new view assigns the selected asset an owner
- **THEN** the open card SHALL display that owner from the current projection

