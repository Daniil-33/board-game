# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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
