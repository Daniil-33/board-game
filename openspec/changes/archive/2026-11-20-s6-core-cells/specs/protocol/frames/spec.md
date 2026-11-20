# protocol/frames Specification

## Purpose
Defines the shared wire contracts for stage 6 special-cell commands, state and events.

## ADDED Requirements

### Requirement: Special-cell protocol contracts
The protocol SHALL validate `PlaceCasinoBet {amount}`, null-payload `DeclineCasino` and null-payload `PayJailFee`; expose casino in `StateView`; define the casino, chance and final jail event payloads; classify those events as public; and increment `PROTOCOL_VERSION` once for this contract change. Core exports SHALL include pure `jailFee(economy)` and `casinoCap(economy)` helpers. Interim jail commands, events and temporary text SHALL be absent.

#### Scenario: Special-cell command round trip
- **WHEN** a valid stage 6 command is encoded and decoded
- **THEN** the payload and command type SHALL be preserved by the shared protocol schema
