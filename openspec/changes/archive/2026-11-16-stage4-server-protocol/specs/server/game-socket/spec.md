# Spec Delta

## ADDED Requirements

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
