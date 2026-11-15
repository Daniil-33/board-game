# Spec Delta

## MODIFIED Requirements

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

### Requirement: Intents only
Commands SHALL contain t, commandId, type, expected and payload:null, without
actor. Existing roll/end-turn commands SHALL retain target expectations.
Resign SHALL use a revision expectation from the latest checked frame revision.
The client SHALL NOT compute elimination, winners or other game outcomes.

#### Scenario: Resign outside own turn
- **WHEN** a connected active player confirms resignation in setup or play
- **THEN** Resign SHALL carry the current revision expectation, irrespective
  of turn ownership or deadline


#### Scenario: Roll dice frame
- **WHEN** the active player presses Roll in turn `t7`
- **THEN** the frame SHALL be `{ t: 'Command', commandId, type: 'RollDice', expected: { kind: 'target', target: { kind: 'turn', id: 't7' } }, payload: null }` and SHALL pass `decodeClientFrame`

## ADDED Requirements

### Requirement: Disconnect is not resignation
A transport drop SHALL retain the existing Hello/backoff and unchanged pending
command retry behavior. It SHALL NOT itself send Leave or Resign, or mark the
viewer eliminated.

#### Scenario: Reconnect
- **WHEN** the network drops during play without a resignation intent
- **THEN** the client SHALL reconnect using the last held revision and render
  the authoritative Welcome without inventing resignation
