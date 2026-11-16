# client/game-screen Specification

## Purpose
Defines what the game screen shows from the server's view: the Vue HUD (turn
order, active player, timer, actions) and the PixiJS board (placeholder ring,
tokens, dice and movement animation).

## Requirements

### Requirement: Turn order and active player
The HUD SHALL retain existing active order/setup display and additionally show
eliminated participants with explicit out markers even when absent from active
order/groups. Names SHALL come from the refreshed member map.

#### Scenario: Eliminated participant
- **WHEN** a player appears in view.eliminated but no longer in view.order
- **THEN** the HUD SHALL still identify that player as out

#### Scenario: Playing
- **WHEN** the view has `order: [b, a, c]` and `turn.playerId: a`
- **THEN** the HUD SHALL list b, a, c in that order with a marked active

#### Scenario: Setup tie
- **WHEN** the view has `setup.groups: [[c], [a, b]]`
- **THEN** the HUD SHALL list c first and SHALL mark a and b as tied

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
`RollForOrder` SHALL require setup and the viewer as `setup.playerId`.
`RollDice` SHALL require playing, the viewer as turn owner and `rolled: false`;
`EndTurn` SHALL require playing, the viewer as turn owner and `rolled: true`.
RollDice and EndTurn SHALL be disabled during auctions. Buttons SHALL be
disabled while disconnected, while their command type is pending, and once
the server deadline has passed.

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

### Requirement: Generated board
The board SHALL render all 40 projected cells with company names for assets and Start, Jail, Casino, Go to jail or Chance for other cells. Assets SHALL show projected prices and distinct markers per groupId; long names SHALL wrap or truncate legibly. No placeholder marker SHALL remain. Player colors SHALL remain stable. Eliminated tokens SHALL be hidden; authoritative elimination and finished updates SHALL cancel obsolete animations before snapping to the projection.

#### Scenario: Elimination during animation
- **WHEN** an elimination update arrives while the player's movement is queued
- **THEN** that player's token SHALL disappear and queued motion SHALL NOT restore it

#### Scenario: Board contents
- **WHEN** the board is built for a view with three players
- **THEN** it SHALL contain the 40 projected cells, a jail box marker and three tokens, with asset names, prices and group markers and no placeholder caption

#### Scenario: Group distinction
- **WHEN** a generated board contains M1 through M8, logistics and energy
- **THEN** every group SHALL have a distinct marker used consistently across its cells

### Requirement: Animation follows events in order
The client SHALL animate authoritative Update events sequentially and synchronize tokens to the view when idle or receiving Welcome.

#### Scenario: Animation detail contract
- **WHEN** this requirement is exercised
- **THEN** the following constraints SHALL hold:

Events of an `Update` SHALL be turned into animation steps and played one at
a time in the order received, across updates. `DiceRolled` and
`OrderDieRolled` SHALL show the rolled values from the event. `PlayerMoved`
SHALL move the token cell by cell from `from` through `steps` cells, wrapping
after cell 39. `SentToJail` SHALL move the token straight to the jail cell.
An unknown event type SHALL be skipped without error. When no animation is
running, and after every `Welcome`, tokens SHALL stand on the view's
positions.

#### Scenario: Roll then move
- **WHEN** an update carries `DiceRolled { dice: [3, 4] }` then `PlayerMoved { from: 38, to: 5, steps: 7 }`
- **THEN** the dice step SHALL finish before the token moves, and the token SHALL visit 39, 0, 1, 2, 3, 4, 5 in that order

#### Scenario: Two updates
- **WHEN** a second update arrives while the first one's steps are still playing
- **THEN** all steps of the first update SHALL play before any step of the second

#### Scenario: Third double
- **WHEN** an update carries `DiceRolled` then `SentToJail { from: 12, to: 10 }`
- **THEN** the token SHALL go to cell 10 without walking the ring

#### Scenario: Welcome during animation
- **WHEN** `Welcome` arrives while steps are waiting
- **THEN** the waiting steps SHALL be dropped and tokens SHALL stand on the `Welcome` view's positions

### Requirement: Confirmed resignation and spectator
Setup and play SHALL offer Resign to connected non-eliminated participants,
independent of turn/deadline. Confirmation SHALL explain permanent elimination
and continued watching. Cancel SHALL send no command. Confirmation SHALL send
one Resign intent; pending resignation SHALL prevent duplicate sends. Rejection
SHALL be visible. Elimination SHALL occur visually only after server projection.
An eliminated viewer SHALL remain connected, see “You are out”, and have no
gameplay controls enabled.

#### Scenario: Cancel
- **WHEN** the player cancels resignation confirmation
- **THEN** no Resign SHALL be sent and the screen SHALL keep following the view

#### Scenario: Three-player spectator
- **WHEN** the server eliminates the viewer while two others remain active
- **THEN** the viewer SHALL keep receiving the game and see their out status

### Requirement: Game over
Every viewer SHALL show a game-over screen on phase finished, naming only
view.winner as winner and offering return to lobby. This SHALL work from setup
without positions and from play, including for eliminated viewers. Returning
SHALL disconnect and clear the local room without sending pre-start Leave.

#### Scenario: Last opponent resigns
- **WHEN** a finished projection names the surviving winner
- **THEN** both clients SHALL show that winner and a return-to-lobby control

#### Scenario: Finish during setup
- **WHEN** finished arrives with no positions or turn
- **THEN** game over SHALL render without requiring a playing-state board

### Requirement: Public player balances
A player panel SHALL show every participant's nickname, projected balance, active-turn mark and eliminated mark. Each new server view SHALL refresh balances, including lap rewards. The production client SHALL NOT calculate prices, capital or rewards.

#### Scenario: Lap reward update
- **WHEN** an Update supplies a new balance after a lap reward
- **THEN** the panel SHALL display the supplied balance immediately, independently of queued movement animation

#### Scenario: Eliminated participant remains visible
- **WHEN** an eliminated participant is absent from the active turn order
- **THEN** the panel SHALL retain their nickname, projected balance and eliminated mark

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
