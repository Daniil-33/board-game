# Spec Delta

## Purpose

Defines the WebSocket game endpoint: authentication by `Hello`, commands,
updates, reconnect and closing.

## ADDED Requirements

### Requirement: Hello first
On GET /ws the server SHALL require a valid Hello within 10 seconds, validate version, token, room and membership in that order, and answer Welcome or Error followed by close as specified below.

#### Scenario: Handshake detail contract
- **WHEN** this requirement is exercised
- **THEN** the following constraints SHALL hold:

On `GET /ws` the first frame SHALL be a valid `Hello`, received within 10
seconds. The server SHALL check, in order, the protocol version
(`PROTOCOL_VERSION_UNSUPPORTED`), the token (`UNAUTHENTICATED`), the room
(`ROOM_UNAVAILABLE` when unknown or failed, `ROOM_CLOSED` when closed) and
membership in the committed game state (`NOT_A_PARTICIPANT`), answering a
failure with an `Error` frame and closing the socket. On success it SHALL
answer `Welcome` with the guest id as `playerId`, the current revision and
the guest's projection. Rooms in `lobby`, `playing` and `finished` SHALL be
accepted.

#### Scenario: Non-member
- **WHEN** a valid guest that is not a member sends `Hello` for a room
- **THEN** the server SHALL send `Error NOT_A_PARTICIPANT` and close the socket

#### Scenario: Finished room
- **WHEN** a member sends `Hello` for a finished room, also after a server restart
- **THEN** the server SHALL answer `Welcome` with a view in phase `finished` naming the winner

#### Scenario: Command before Hello
- **WHEN** the first frame is a `Command` or malformed
- **THEN** the server SHALL send `Error MALFORMED_FRAME` and close the socket

### Requirement: Commands from the authenticated guest
A `Command` frame SHALL be submitted to the room with actor `{ kind:
'player', id: guestId }` of the socket. The server SHALL answer `Ack` only
after the room resolved the command: `accepted` with its revision after
persistence, `rejected` with the error. A duplicate `commandId` with the
same body SHALL be answered with the original `Ack`. `Resign` SHALL be
accepted as a client command. A malformed frame after `Hello` SHALL be
answered `Error MALFORMED_FRAME` without closing.

#### Scenario: Unknown property
- **WHEN** a `Command` frame carries an `actor` field
- **THEN** the server SHALL answer `Error MALFORMED_FRAME` and submit nothing

#### Scenario: Duplicate delivery
- **WHEN** the same `Command` frame is sent twice
- **THEN** both `Ack`s SHALL be `accepted` with the same revision and the log SHALL hold one entry

### Requirement: Updates to every member
After every committed change of a room, every connected member SHALL receive
`Update` with the revision, its own projection of the state and its
projection of the events, in revision order and without revisions at or
below its `Welcome`. Lobby changes (join, leave) SHALL reach members that
are connected in phase `lobby`.

#### Scenario: Join seen in lobby
- **WHEN** a guest joins while the creator is connected
- **THEN** the creator SHALL receive an `Update` with a `PlayerAdded` event

### Requirement: Game end
When the core enters phase `finished`, `rooms.status` SHALL become `finished`
in the transaction of that log entry and every connected member SHALL
receive the `Update` with `GameEnded`.

#### Scenario: Resign down to a winner
- **WHEN** in a three-player game one player resigns on their own turn and another on someone else's turn
- **THEN** both resignations SHALL be acknowledged, the last `Update` SHALL carry `GameEnded` with the remaining player, and `rooms.status` SHALL be `finished`

### Requirement: Reconnect, not resignation
Closing a socket SHALL NOT submit any command. A new `Hello { lastRevision }`
from the same guest SHALL be answered `Welcome` with the current state. When
a guest already has a socket for that room, the older one SHALL receive
`Error CONNECTION_REPLACED` and be closed; the newer one SHALL keep
receiving updates.

#### Scenario: Drop and reconnect
- **WHEN** a player's socket drops mid-turn and reconnects with the last revision it saw
- **THEN** the game SHALL be unchanged by the drop and the player SHALL get `Welcome` at the current revision

#### Scenario: Server restart
- **WHEN** the server is shut down mid-game and a new server starts on the same database
- **THEN** both players SHALL reconnect with `Hello`, get `Welcome` at the persisted revision and continue playing

### Requirement: Removed members are disconnected
A member removed by `LeaveLobby` SHALL receive the `Update` and then `Error
NOT_A_PARTICIPANT`, and its socket SHALL close. When the room closes every
connected socket SHALL receive `Error ROOM_CLOSED` and close.

#### Scenario: Leaver's socket
- **WHEN** a connected member leaves through the HTTP route
- **THEN** that member's socket SHALL receive `Error NOT_A_PARTICIPANT` and close
