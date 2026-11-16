## MODIFIED Requirements

### Requirement: Protocol version
The package SHALL export `PROTOCOL_VERSION` equal to `2`. `Hello` and
`Welcome` SHALL carry the protocol version.

#### Scenario: Version constant
- **WHEN** `PROTOCOL_VERSION` is imported
- **THEN** it SHALL equal `2`

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

## ADDED Requirements

### Requirement: Stage 2 public projection and events
Welcome and Update views SHALL carry the core public board, economy and balances. Update events SHALL carry public BoardGenerated and BalanceChanged events without changing their core payloads. The view schema description SHALL document these public fields.

#### Scenario: Stage 2 frame round trip
- **WHEN** a Welcome or Update with a generated CLASSIC_40 board, economy and player balances is encoded and decoded
- **THEN** the frame SHALL round-trip unchanged, including BoardGenerated and BalanceChanged events on an Update
