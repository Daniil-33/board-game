# protocol/frames Specification

## Purpose
Defines the WebSocket frames exchanged between the browser client and the
authoritative room server, including stage 2 board and money state, the protocol version, the error codes,
and how untrusted frame text is decoded.

## Requirements

### Requirement: Protocol version
The package SHALL export `PROTOCOL_VERSION` equal to `3`. `Hello` and
`Welcome` SHALL carry the protocol version.

#### Scenario: Version constant
- **WHEN** `PROTOCOL_VERSION` is imported
- **THEN** it SHALL equal `3`

### Requirement: Frame set
Every WebSocket frame SHALL be a JSON object tagged by a string field `t` and SHALL conform to exactly one of the client or server frame shapes below.

#### Scenario: Frame shape contract
- **WHEN** this requirement is exercised
- **THEN** the following constraints SHALL hold:

Every WebSocket frame SHALL be a JSON object tagged by a string field `t`.
Client frames SHALL be exactly:
- `Hello { t, protocolVersion, token, gameId, lastRevision }` where
  `lastRevision` is a revision or `null`;
- `Command { t, commandId, type, expected, payload }` where `expected` is a
  game-core `Expectation` (`{ kind: 'revision', revision }` or
  `{ kind: 'target', target: { kind, id } }`).

Server frames SHALL be exactly:
- `Welcome { t, protocolVersion, playerId, revision, view }`;
- `Ack { t, commandId, outcome, revision, error? }` with `outcome` one of
  `accepted`, `rejected`; `error { code, message }` SHALL be present exactly
  when `outcome` is `rejected`;
- `Update { t, revision, view, events }`;
- `Error { t, code, message }`.

#### Scenario: Round trip
- **WHEN** any valid frame of the set is serialized with `JSON.stringify` and decoded by the matching decoder
- **THEN** the decoder SHALL return the frame deep-equal to the original

#### Scenario: Wrong direction
- **WHEN** a server frame is passed to `decodeClientFrame`, or a client frame to `decodeServerFrame`
- **THEN** the decoder SHALL return a `MALFORMED_FRAME` error

### Requirement: Clients send intents only
Client frames SHALL NOT carry an `actor` field or any other field not listed
in the frame set. Every object in every frame schema SHALL reject unknown
properties.

#### Scenario: Client actor rejected
- **WHEN** a `Command` frame that is otherwise valid also has an `actor` field
- **THEN** `decodeClientFrame` SHALL return a `MALFORMED_FRAME` error

#### Scenario: Extra field rejected
- **WHEN** any frame, or any nested object in it other than `view`, event payloads and command payloads, has a property not in its schema
- **THEN** the matching decoder SHALL return a `MALFORMED_FRAME` error

### Requirement: Error codes
The protocol error codes SHALL be `PROTOCOL_VERSION_UNSUPPORTED`,
`UNAUTHENTICATED`, `NOT_A_PARTICIPANT`, `MALFORMED_FRAME`,
`ROOM_UNAVAILABLE`, `ROOM_CLOSED` and `CONNECTION_REPLACED`. The `code` of an
`Error` frame or an `Ack` error SHALL accept these and any other string of 1
to 64 characters, so engine error codes pass through unchanged; a longer code
SHALL be rejected.

#### Scenario: Engine code passes through
- **WHEN** an `Ack` with `outcome: 'rejected'` and `error.code: 'TARGET_MISMATCH'` is decoded
- **THEN** the decoder SHALL return it unchanged

#### Scenario: New codes exported
- **WHEN** `PROTOCOL_ERROR_CODES` is read
- **THEN** it SHALL contain `ROOM_CLOSED` and `CONNECTION_REPLACED`

### Requirement: Total decoding
`decodeClientFrame(raw)` and `decodeServerFrame(raw)` SHALL never throw. For
any input that is not a string, is longer than `MAX_FRAME_LENGTH`, is not
valid JSON, or does not match a frame schema of that direction, they SHALL
return `{ ok: false, error: { code: 'MALFORMED_FRAME', message } }`.

#### Scenario: Hostile strings
- **WHEN** the decoders receive inputs such as `''`, `'null'`, `'[]'`, `'"Hello"'`, `'{"t":"__proto__"}'`, a `__proto__` key, deeply nested arrays, a lone surrogate, a number where a string is expected, `NaN`-like text, or text over `MAX_FRAME_LENGTH`
- **THEN** each SHALL return a `MALFORMED_FRAME` error and SHALL NOT throw

### Requirement: Typed from game-core
`view` SHALL have the static type `StateView` and `events` the static type
`GameEvent[]` from `@game/game-core`. At runtime the decoder SHALL check that
`view` is a JSON object and that each event is `{ type: string, payload }`.
`payload` SHALL be present on every event; an event without data SHALL carry
`payload: null`. The `view` schema `description` SHALL state: "Interim jail
state in this view is temporary (stage 1 interim rule, replaced in stage 6)."
without naming game-core symbols.

#### Scenario: View must be an object
- **WHEN** an `Update` has `view: null` or `view: []`
- **THEN** `decodeServerFrame` SHALL return a `MALFORMED_FRAME` error

### Requirement: Client command types
The client `Command` types SHALL be exactly `RollForOrder`, `RollDice`,
`EndTurn`, `Resign`, `BuyAsset`, `StartAuction`, `Bid` and `PassAuction`, each with payload `null`, named as in game-core.

#### Scenario: Resign frame
- **WHEN** `{ t: 'Command', commandId: 'c1', type: 'Resign', expected: { kind: 'revision', revision: 7 }, payload: null }` is decoded
- **THEN** `decodeClientFrame` SHALL return it unchanged

#### Scenario: System command refused
- **WHEN** a `Command` frame has type `Timeout`, `StartGame` or `LeaveLobby`
- **THEN** `decodeClientFrame` SHALL return a `MALFORMED_FRAME` error

#### Scenario: Purchase and auction intents
- **WHEN** any of BuyAsset, StartAuction, Bid or PassAuction is decoded with a valid expectation
- **THEN** null payload SHALL be accepted and every non-null payload SHALL be rejected

### Requirement: Storable ids
Every id string (room/game id, guest id, player id, command id) SHALL reject
U+0000 and lone surrogates, under both the TypeBox checker and Ajv, so every
accepted id can be stored in Postgres `text` and `jsonb`.

#### Scenario: NUL and lone surrogate
- **WHEN** a `Command` frame has `commandId` `'a\u0000b'` or `'a\ud800'`
- **THEN** the decoder SHALL return `MALFORMED_FRAME`, while `'a😀'` SHALL be accepted

### Requirement: Stage 2 public projection and events
Welcome and Update views SHALL carry the core public board, economy and balances. Update events SHALL carry public BoardGenerated and BalanceChanged events without changing their core payloads. The view schema description SHALL document these public fields.

#### Scenario: Stage 2 frame round trip
- **WHEN** a Welcome or Update with a generated CLASSIC_40 board, economy and player balances is encoded and decoded
- **THEN** the frame SHALL round-trip unchanged, including BoardGenerated and BalanceChanged events on an Update

#### Scenario: Public view schema description
- **WHEN** the view schema description is read
- **THEN** it SHALL equal "Public projection of the game state (game-core StateView), checked only as a JSON object. Includes the public generated board, economy, balances, asset owners, purchase decision and auction state. Interim jail state in this view is temporary (stage 1 interim rule, replaced in stage 6)."

### Requirement: Stage 3 public projection and events
Welcome and Update views SHALL carry the core public owners, purchase decision and auction, including the responder and response deadline. Purchase and auction events SHALL retain their core payloads. Views SHALL remain statically typed as StateView and checked as JSON objects at runtime.

#### Scenario: Auction round trip
- **WHEN** Welcome or Update carries a running auction or pending purchase decision
- **THEN** encoding and decoding SHALL preserve the public state and events unchanged
