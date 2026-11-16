## MODIFIED Requirements

### Requirement: Protocol version
The package SHALL export `PROTOCOL_VERSION` equal to `3`. `Hello` and
`Welcome` SHALL carry the protocol version.

#### Scenario: Version constant
- **WHEN** `PROTOCOL_VERSION` is imported
- **THEN** it SHALL equal `3`

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

### Requirement: Stage 2 public projection and events
Welcome and Update views SHALL carry the core public board, economy and balances. Update events SHALL carry public BoardGenerated and BalanceChanged events without changing their core payloads. The view schema description SHALL document these public fields.

#### Scenario: Stage 2 frame round trip
- **WHEN** a Welcome or Update with a generated CLASSIC_40 board, economy and player balances is encoded and decoded
- **THEN** the frame SHALL round-trip unchanged, including BoardGenerated and BalanceChanged events on an Update

#### Scenario: Public view schema description
- **WHEN** the view schema description is read
- **THEN** it SHALL equal "Public projection of the game state (game-core StateView), checked only as a JSON object. Includes the public generated board, economy, balances, asset owners, purchase decision and auction state. Interim jail state in this view is temporary (stage 1 interim rule, replaced in stage 6)."

## ADDED Requirements

### Requirement: Stage 3 public projection and events
Welcome and Update views SHALL carry the core public owners, purchase decision and auction, including the responder and response deadline. Purchase and auction events SHALL retain their core payloads. Views SHALL remain statically typed as StateView and checked as JSON objects at runtime.

#### Scenario: Auction round trip
- **WHEN** Welcome or Update carries a running auction or pending purchase decision
- **THEN** encoding and decoding SHALL preserve the public state and events unchanged
