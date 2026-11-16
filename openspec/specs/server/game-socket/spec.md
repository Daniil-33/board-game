# server/game-socket Specification

## Purpose
Defines the WebSocket game endpoint: authentication by `Hello`, commands,
updates, reconnect and closing.

## Requirements

### Requirement: Hello first
On GET /ws the server SHALL require a valid Hello within 10 seconds, validate version, token, room and membership in that order, and answer Welcome or Error followed by close as specified below.

#### Scenario: Handshake detail contract
- **WHEN** this requirement is exercised
- **THEN** the following constraints SHALL hold:

On `GET /ws` the first frame SHALL be a valid `Hello`, received within 10
seconds. The server SHALL check, in order, the protocol version
(`PROTOCOL_VERSION_UNSUPPORTED`), the token (`UNAUTHENTICATED`), the room
(`ROOM_CLOSED` for a closed row before opening, `ROOM_UNAVAILABLE` when unknown or opening fails, including core-3 and core-4 games) and
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

#### Scenario: Stage 1 protocol rejected
- **WHEN** a client sends a version 1 Hello
- **THEN** the server SHALL send PROTOCOL_VERSION_UNSUPPORTED and close the socket before authenticating

#### Scenario: Migrated stage 1 game
- **WHEN** an authenticated guest sends a version 3 Hello for a core-3 game closed by migration 0003
- **THEN** the server SHALL send ROOM_CLOSED and close the socket

#### Scenario: Finished stage 1 game
- **WHEN** an authenticated guest sends a version 3 Hello for a finished core-3 game untouched by migration 0003
- **THEN** opening SHALL fail and the server SHALL send ROOM_UNAVAILABLE and close the socket without changing stored game data


#### Scenario: Stage 2 protocol rejected
- **WHEN** a client sends a version 2 Hello
- **THEN** the server SHALL send PROTOCOL_VERSION_UNSUPPORTED and close before authenticating

#### Scenario: Stage 2 stored game
- **WHEN** an authenticated guest sends a version 3 Hello for a core-4 game
- **THEN** a closed row SHALL answer ROOM_CLOSED before opening, while an unsupported finished game SHALL answer ROOM_UNAVAILABLE without changing stored data

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

### Requirement: Stage 2 state reaches every guest
Every connected member SHALL receive the same public generated board, economy and balances in Welcome and committed Update views. Starting capital and lap rewards SHALL be delivered as the unchanged public BalanceChanged events from the core.

#### Scenario: Two and three guests
- **WHEN** games with two and three guests start
- **THEN** every guest in each game SHALL see the same board and starting balances of 29910 and 19940 respectively

#### Scenario: Different new games
- **WHEN** two games are created with distinct deterministic test inputs that produce different compositions
- **THEN** their projected board compositions SHALL differ

#### Scenario: Start crossing
- **WHEN** a seeded forward move crosses start
- **THEN** every connected guest SHALL receive an Update with the same credited balance and BalanceChanged lap-reward event after persistence

#### Scenario: Restart and reconnect
- **WHEN** the server restarts mid-game and guests reconnect
- **THEN** each Welcome's board, economy and balances SHALL be deep-equal to the last committed view before restart

### Requirement: Auction responder commands
The authenticated responder SHALL be able to submit Bid and PassAuction with the current auctionResponse target even when another player owns the turn. The core SHALL decide legality. Accepted changes SHALL persist before Update reaches every connected member.

#### Scenario: Three guests complete an auction
- **WHEN** three guests bid, outbid, pass and let an AFK response expire
- **THEN** every guest SHALL receive the same committed auction state, final ownership, balances and public events

#### Scenario: Auction with no bids
- **WHEN** every participant passes or times out without bidding
- **THEN** every guest SHALL see an unsold asset with no owner

#### Scenario: Stale response and duplicate delivery
- **WHEN** a new command id targets an earlier response slot or an accepted frame is delivered again
- **THEN** the stale command SHALL be rejected and the exact duplicate SHALL return the original Ack, with neither causing another state change, log entry or broadcast

### Requirement: Stage 4 protocol handshake
A version 3 Hello SHALL be rejected with PROTOCOL_VERSION_UNSUPPORTED before authentication. A version 4 Hello for a closed stage 3 room SHALL return ROOM_CLOSED before opening the game.

#### Scenario: Old client
- **WHEN** a version 3 Hello arrives
- **THEN** the server SHALL send PROTOCOL_VERSION_UNSUPPORTED and close the socket

#### Scenario: Retired room
- **WHEN** an authenticated guest sends version 4 Hello for a room closed by migration 0005
- **THEN** the server SHALL send ROOM_CLOSED and close without changing stored game data

### Requirement: Stage 4 authenticated intents
PayRent, BuildHouse and SellHouse SHALL execute with the session actor through the existing sequential core-persist-broadcast pipeline. Rejected Acks SHALL retain the specific core error code. All connected members SHALL receive the committed public houses, rent, rentQuotes, balances and events.

#### Scenario: Three guests see rent payment
- **WHEN** the turn owner pays an open settlement
- **THEN** all three guests SHALL receive identical public balances, cleared rent and RentPaid events after persistence

#### Scenario: Build rejection and sale
- **WHEN** the turn owner builds, attempts an illegal build, then sells
- **THEN** accepted changes SHALL broadcast and the illegal attempt SHALL return the core error without changing state or logs

#### Scenario: Duplicate and stale intents
- **WHEN** an accepted stage 4 command is delivered again or a new command targets an earlier turn
- **THEN** the duplicate SHALL return the original Ack and the stale command SHALL be rejected, with neither applying another change
