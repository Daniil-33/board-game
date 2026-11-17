# client/connection Specification

## Purpose
Defines how the client talks to the room server over WebSocket with
`@game/protocol`: decoding, the Hello/Welcome handshake, commands and their
acknowledgements, and reconnect.

## Requirements

### Requirement: Frames go through the protocol
Every received WebSocket message SHALL be decoded with `decodeServerFrame`;
a message that fails decoding SHALL be dropped and reported, never applied.
Every sent frame SHALL be a `Hello`, `Command` or `ChatSend` of `@game/protocol`.
A `ChatSend` SHALL be sent only while connected and SHALL NOT be resent after a reconnect.

#### Scenario: Malformed message
- **WHEN** the socket delivers text that is not a valid server frame
- **THEN** the held view SHALL NOT change and a connection problem SHALL be reported

#### Scenario: Chat is not resent
- **WHEN** the socket drops while a `ChatSend` waits for its `ChatAck` and a new `Welcome` arrives
- **THEN** the client SHALL send no `ChatSend` on the new socket

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
Commands SHALL contain t, commandId, type, expected and payload, without
actor. The payload SHALL be `null` except where the protocol defines one:
`BuildHouse`, `SellHouse`, `Mortgage` and `Redeem` SHALL carry `{ assetId }`. Existing roll/end-turn
commands SHALL retain target expectations. Resign SHALL use a revision
expectation from the latest checked frame revision. The client SHALL NOT
compute elimination, winners, rent payments, house changes or other game
outcomes.

#### Scenario: Resign outside own turn
- **WHEN** a connected active player confirms resignation in setup or play
- **THEN** Resign SHALL carry the current revision expectation, irrespective
  of turn ownership or deadline

#### Scenario: Roll dice frame
- **WHEN** the active player presses Roll in turn `t7`
- **THEN** the frame SHALL be `{ t: 'Command', commandId, type: 'RollDice', expected: { kind: 'target', target: { kind: 'turn', id: 't7' } }, payload: null }` and SHALL pass `decodeClientFrame`

#### Scenario: Build house frame
- **WHEN** the active player presses Build on asset `a12` in turn `t7`
- **THEN** the frame SHALL be `{ t: 'Command', commandId, type: 'BuildHouse', expected: { kind: 'target', target: { kind: 'turn', id: 't7' } }, payload: { assetId: 'a12' } }` and SHALL pass `decodeClientFrame`

#### Scenario: Mortgage and redeem frames
- **WHEN** the viewer selects Mortgage or Redeem on asset a12 in turn t7
- **THEN** the command SHALL carry its selected type, payload `{ assetId: 'a12' }` and target `{ kind: 'turn', id: 't7' }` and pass decodeClientFrame

#### Scenario: Rejected or accepted mortgage command
- **WHEN** an Ack rejects or accepts Mortgage or Redeem
- **THEN** a rejection SHALL show its code and message and neither outcome SHALL change the projected mortgage, balance or rent locally

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
UNAUTHENTICATED SHALL return to login. NOT_A_PARTICIPANT, ROOM_UNAVAILABLE and
ROOM_CLOSED SHALL stop reconnecting, clear the room and return to lobby with a
message. PROTOCOL_VERSION_UNSUPPORTED SHALL stop with a reload message.
CONNECTION_REPLACED SHALL stop reconnecting and pending commands, show that the
room is open in another tab, and preserve shared guest/room storage. Other
codes SHALL be displayed.

#### Scenario: Closed room
- **WHEN** ROOM_CLOSED arrives, or get-room reports status closed
- **THEN** the client SHALL return to lobby with a closure notice

#### Scenario: Replaced connection
- **WHEN** CONNECTION_REPLACED arrives followed by socket close
- **THEN** no reconnect SHALL be scheduled and shared room storage SHALL remain

#### Scenario: Room gone
- **WHEN** `Error { code: 'ROOM_UNAVAILABLE' }` arrives
- **THEN** the stored room SHALL be cleared and the lobby SHALL be shown

### Requirement: Disconnect is not resignation
A transport drop SHALL retain the existing Hello/backoff and unchanged pending
command retry behavior. It SHALL NOT itself send Leave or Resign, or mark the
viewer eliminated.

#### Scenario: Reconnect
- **WHEN** the network drops during play without a resignation intent
- **THEN** the client SHALL reconnect using the last held revision and render
  the authoritative Welcome without inventing resignation

### Requirement: Runtime API origin
The client SHALL use the API origin loaded from `/config.js` for REST requests and `/ws` connections. HTTPS SHALL map to WSS and HTTP to WS. Empty or absent configuration SHALL retain relative REST URLs and sockets on the page host. Authentication SHALL continue using tokens without cookies.

#### Scenario: Separate HTTPS host
- **WHEN** the page uses runtime API origin `https://stage-api.focusima.space`
- **THEN** REST SHALL target that origin and sockets SHALL target `wss://stage-api.focusima.space/ws`

#### Scenario: HTTP host
- **WHEN** runtime API origin is `http://localhost:8787`
- **THEN** REST SHALL target that origin and sockets SHALL target `ws://localhost:8787/ws`

#### Scenario: Default URLs
- **WHEN** runtime API origin is empty or absent
- **THEN** REST SHALL use existing relative API paths and sockets SHALL use the page host with WS or WSS according to its protocol

### Requirement: Client origin invites
Invite links SHALL resolve against the client page origin irrespective of the configured API origin.

#### Scenario: Separate API host invite
- **WHEN** a room is created from a client served on `https://stage.focusima.space` with a distinct API origin
- **THEN** its invite link SHALL use `https://stage.focusima.space` and retain the room and access code
