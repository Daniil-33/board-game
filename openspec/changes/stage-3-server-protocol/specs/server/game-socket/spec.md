## MODIFIED Requirements

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

## ADDED Requirements

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
