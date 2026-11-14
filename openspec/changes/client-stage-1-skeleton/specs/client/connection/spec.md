# Spec Delta

## Purpose

Defines how the client talks to the room server over WebSocket with
`@game/protocol`: decoding, the Hello/Welcome handshake, commands and their
acknowledgements, and reconnect.

## ADDED Requirements

### Requirement: Frames go through the protocol
Every received WebSocket message SHALL be decoded with `decodeServerFrame`;
a message that fails decoding SHALL be dropped and reported, never applied.
Every sent frame SHALL be a `Hello` or `Command` of `@game/protocol`.

#### Scenario: Malformed message
- **WHEN** the socket delivers text that is not a valid server frame
- **THEN** the held view SHALL NOT change and a connection problem SHALL be reported

### Requirement: Handshake
On every socket open the client SHALL send `Hello` with `PROTOCOL_VERSION`,
the stored token, the room id as `gameId`, and `lastRevision` equal to the
revision of the view it holds, or `null` when it holds none. On `Welcome` it
SHALL take `playerId` and replace its view with the frame's view.

#### Scenario: First connect
- **WHEN** the client connects to a room with no view in memory
- **THEN** it SHALL send `Hello` with `lastRevision: null`

#### Scenario: Welcome replaces the view
- **WHEN** `Welcome` arrives with revision 12
- **THEN** the HUD and the board SHALL render that view and tokens SHALL stand on its positions

### Requirement: Intents only
A command frame SHALL contain exactly `t`, `commandId`, `type`, `expected`
and `payload: null`. It SHALL NOT contain `actor`. `expected` SHALL be a
target expectation read from the current view: the setup roll id for
`RollForOrder`, the turn id for `RollDice` and `EndTurn`. The client SHALL
NOT compute dice, movement, order, jail or deadline outcomes; it SHALL render
only what `Welcome` and `Update` carry.

#### Scenario: Roll dice frame
- **WHEN** the active player presses Roll in turn `t7`
- **THEN** the frame SHALL be `{ t: 'Command', commandId, type: 'RollDice', expected: { kind: 'target', target: { kind: 'turn', id: 't7' } }, payload: null }` and SHALL pass `decodeClientFrame`

### Requirement: Updates
On `Update` with a revision greater than the held one the client SHALL
replace its view and pass the frame's events, in order, to the animation
queue. An `Update` with a revision not greater than the held one SHALL be
ignored.

#### Scenario: Stale update
- **WHEN** the client holds revision 9 and receives `Update` with revision 9
- **THEN** the view SHALL NOT change and no animation SHALL be queued

### Requirement: Acknowledgements
A sent command SHALL stay pending until its `Ack` arrives. A `rejected` `Ack`
SHALL show its error code and message to the player. An `accepted` `Ack`
SHALL NOT change the view by itself.

#### Scenario: Rejected command
- **WHEN** `Ack { outcome: 'rejected', error: { code: 'DEADLINE_PASSED', message } }` arrives for a pending command
- **THEN** the command SHALL no longer be pending and the HUD SHALL show the code and message

### Requirement: Reconnect
When the socket closes or errors while a room is joined, the client SHALL
reconnect with backoff and send `Hello` with the last held revision. After
`Welcome` it SHALL resend every still-pending command unchanged, with its
original `commandId`. It SHALL NOT create a new `commandId` for a command
already sent. After a tab reload it SHALL reconnect to the stored room with
`lastRevision: null`.

#### Scenario: Socket drop mid-turn
- **WHEN** the socket closes while the client holds revision 20
- **THEN** the next `Hello` SHALL carry `lastRevision: 20` and the `Welcome` view SHALL be rendered

#### Scenario: Pending command survives a drop
- **WHEN** a command with id `c1` was sent, the socket closed before its `Ack`, and the client reconnected
- **THEN** exactly one command frame with `commandId: 'c1'` SHALL be sent after `Welcome`, and no command with a new id

#### Scenario: Acknowledged command not resent
- **WHEN** a command was acknowledged before the socket closed
- **THEN** it SHALL NOT be sent again after reconnect

### Requirement: Server errors
On an `Error` frame with `UNAUTHENTICATED` the client SHALL return to login;
with `NOT_A_PARTICIPANT` or `ROOM_UNAVAILABLE` it SHALL forget the room and
return to the lobby; with `PROTOCOL_VERSION_UNSUPPORTED` it SHALL stop
reconnecting and tell the user to reload. Any other code SHALL be shown.

#### Scenario: Room gone
- **WHEN** `Error { code: 'ROOM_UNAVAILABLE' }` arrives
- **THEN** the stored room SHALL be cleared and the lobby SHALL be shown
