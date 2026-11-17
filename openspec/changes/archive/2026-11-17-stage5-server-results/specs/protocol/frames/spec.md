# Spec Delta

## MODIFIED Requirements

### Requirement: Protocol version
The package SHALL export `PROTOCOL_VERSION` equal to `5`. `Hello` and
`Welcome` SHALL carry the protocol version.

#### Scenario: Version constant
- **WHEN** `PROTOCOL_VERSION` is imported
- **THEN** it SHALL equal `5`

### Requirement: Client command types
The client `Command` types SHALL be exactly `RollForOrder`, `RollDice`,
`EndTurn`, `Resign`, `BuyAsset`, `StartAuction`, `Bid`, `PassAuction`, `PayRent`, `BuildHouse`, `SellHouse`, `Mortgage` and `Redeem`, named as in game-core. All except BuildHouse, SellHouse, Mortgage and Redeem SHALL carry payload `null`. BuildHouse, SellHouse, Mortgage and Redeem SHALL carry exactly `{ assetId: string }`, with a storable nonempty id bounded to 128 UTF-16 code units and no extra keys.

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

#### Scenario: Mortgage command payloads
- **WHEN** Mortgage or Redeem is decoded
- **THEN** exactly one bounded storable assetId string SHALL be accepted; null, missing ids, extra keys, nonstrings, empty or oversized ids, NUL and lone surrogates SHALL be rejected

## ADDED Requirements

### Requirement: Stage 5 public projection and events
Welcome and Update SHALL preserve core-7 mortgages, eliminations, result, balances and public events unchanged. The view SHALL remain statically typed as StateView and checked as a JSON object at runtime.

#### Scenario: Core-7 round trip
- **WHEN** a frame carries mortgage progress, liquidation, bankruptcy or a finished result
- **THEN** encoding and decoding SHALL preserve the public projection and event payloads unchanged
