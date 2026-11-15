# Spec Delta

## Purpose

Adds resignation to the client commands, codes for closed rooms and
replaced connections, and storable id strings.

## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: Client command types
The client `Command` types SHALL be exactly `RollForOrder`, `RollDice`,
`EndTurn` and `Resign`, each with payload `null`, named as in game-core.

#### Scenario: Resign frame
- **WHEN** `{ t: 'Command', commandId: 'c1', type: 'Resign', expected: { kind: 'revision', revision: 7 }, payload: null }` is decoded
- **THEN** `decodeClientFrame` SHALL return it unchanged

#### Scenario: System command refused
- **WHEN** a `Command` frame has type `Timeout`, `StartGame` or `LeaveLobby`
- **THEN** `decodeClientFrame` SHALL return a `MALFORMED_FRAME` error

### Requirement: Storable ids
Every id string (room/game id, guest id, player id, command id) SHALL reject
U+0000 and lone surrogates, under both the TypeBox checker and Ajv, so every
accepted id can be stored in Postgres `text` and `jsonb`.

#### Scenario: NUL and lone surrogate
- **WHEN** a `Command` frame has `commandId` `'a\u0000b'` or `'a\ud800'`
- **THEN** the decoder SHALL return `MALFORMED_FRAME`, while `'a😀'` SHALL be accepted
