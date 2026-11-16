# Spec Delta

## MODIFIED Requirements

### Requirement: Protocol version
The package SHALL export `PROTOCOL_VERSION` equal to `4`. `Hello` and
`Welcome` SHALL carry the protocol version.

#### Scenario: Version constant
- **WHEN** `PROTOCOL_VERSION` is imported
- **THEN** it SHALL equal `4`

### Requirement: Client command types
The client `Command` types SHALL be exactly `RollForOrder`, `RollDice`,
`EndTurn`, `Resign`, `BuyAsset`, `StartAuction`, `Bid`, `PassAuction`, `PayRent`, `BuildHouse` and `SellHouse`, named as in game-core. All except BuildHouse and SellHouse SHALL carry payload `null`. BuildHouse and SellHouse SHALL carry exactly `{ assetId: string }`, with a storable nonempty id bounded to 128 UTF-16 code units and no extra keys.

#### Scenario: Resign frame
- **WHEN** `{ t: 'Command', commandId: 'c1', type: 'Resign', expected: { kind: 'revision', revision: 7 }, payload: null }` is decoded
- **THEN** `decodeClientFrame` SHALL return it unchanged

#### Scenario: System command refused
- **WHEN** a `Command` frame has type `Timeout`, `StartGame` or `LeaveLobby`
- **THEN** `decodeClientFrame` SHALL return a `MALFORMED_FRAME` error

#### Scenario: Purchase and auction intents
- **WHEN** any of BuyAsset, StartAuction, Bid or PassAuction is decoded with a valid expectation
- **THEN** null payload SHALL be accepted and every non-null payload SHALL be rejected

#### Scenario: House command payloads
- **WHEN** BuildHouse or SellHouse is decoded
- **THEN** exactly one bounded storable assetId string SHALL be accepted; null, missing ids, extra keys, empty or oversized ids, NUL and lone surrogates SHALL be rejected

#### Scenario: Rent command payload
- **WHEN** PayRent is decoded
- **THEN** null SHALL be accepted and every non-null payload SHALL be rejected

### Requirement: Stage 2 public projection and events
Welcome and Update views SHALL carry the core public board, economy and balances. Update events SHALL carry public BoardGenerated and BalanceChanged events without changing their core payloads. The view schema description SHALL document these public fields.

#### Scenario: Stage 2 frame round trip
- **WHEN** a Welcome or Update with a generated CLASSIC_40 board, economy and player balances is encoded and decoded
- **THEN** the frame SHALL round-trip unchanged, including BoardGenerated and BalanceChanged events on an Update

#### Scenario: Public view schema description
- **WHEN** the view schema description is read
- **THEN** it SHALL equal "Public projection of the game state (game-core StateView), checked only as a JSON object. Includes the public generated board, economy, balances, asset owners, purchase decision, auction state, houses, rent and rent quotes. Interim jail state in this view is temporary (stage 1 interim rule, replaced in stage 6)."

## ADDED Requirements

### Requirement: Stage 4 public projection and events
Welcome and Update SHALL preserve the core public houses, rent settlement, rentQuotes and balances. RentDue, RentPaid, HouseBuilt, HouseSold and BalanceChanged events SHALL retain their core payloads.

#### Scenario: Stage 4 round trip
- **WHEN** a Welcome or Update carries houses, a rent settlement or rent quotes
- **THEN** encoding and decoding SHALL preserve all fields and public events unchanged
