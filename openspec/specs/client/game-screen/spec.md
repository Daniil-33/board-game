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
The timer SHALL show the time left until the view's deadline
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

### Requirement: Action buttons follow the view
`RollForOrder` SHALL be enabled only in phase `setup` when the viewer is
`setup.playerId`. `RollDice` SHALL be enabled only in phase `playing` when
the viewer is `turn.playerId` and `turn.rolled` is false. `EndTurn` SHALL be
enabled only in phase `playing` when the viewer is `turn.playerId` and
`turn.rolled` is true. Every button SHALL be disabled while disconnected,
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

### Requirement: Placeholder board
The board SHALL retain its 40-cell placeholder caption and stable player colors.
Eliminated tokens SHALL be hidden. Authoritative elimination and finished updates
SHALL cancel obsolete animations before snapping the board to the projection.

#### Scenario: Elimination during animation
- **WHEN** an elimination update arrives while the player's movement is queued
- **THEN** that player's token SHALL disappear and queued motion SHALL NOT restore it

#### Scenario: Board contents
- **WHEN** the board is built for a view with three players
- **THEN** it SHALL contain 40 cells, one jail cell marker, the placeholder caption and three tokens

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
