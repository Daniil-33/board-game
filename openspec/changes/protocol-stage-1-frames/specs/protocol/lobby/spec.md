# Spec Delta

## Purpose

Defines the HTTP lobby request and response schemas shared by the server
routes and the client, and the technical nickname rules.

## ADDED Requirements

### Requirement: Lobby operations
The package SHALL export request/response schemas for:
- guest login: request `{ nickname }`, response `{ guestId, token }`;
- create room: no body, response `{ room }`;
- list joinable rooms: response `{ rooms }`;
- join room: path `{ roomId }`, response `{ room }`;
- start game (creator only): path `{ roomId }`, response `{ room }`.

`room` is a `RoomSummary { roomId, creatorId, status, members }` with
`status` one of `lobby`, `playing` and `members` a list of
`{ guestId, nickname }`. `roomId` SHALL be the `gameId` a client sends in
`Hello`. Every object schema SHALL reject unknown properties, except the
request header schema, which only requires its own field.

### Requirement: Lobby authentication and errors
Create, list, join and start SHALL be authenticated by an
`authorization: Bearer <token>` request header, where `<token>` is the token
from guest login (1-512 visible ASCII characters). Every lobby error response
body SHALL be `{ code, message }`. Lobby codes SHALL be `NOT_ROOM_CREATOR`
and `INVALID_REQUEST`, alongside the protocol codes `UNAUTHENTICATED` and
`ROOM_UNAVAILABLE`; engine error codes SHALL pass through unchanged.

#### Scenario: Bearer header
- **WHEN** the header is `Bearer tok.123`, or `bearer tok`, `Bearer `, `Basic x`
- **THEN** only `Bearer tok.123` SHALL pass the header schema

#### Scenario: Engine code in lobby error
- **WHEN** a lobby error body has `code: 'NOT_ENOUGH_PLAYERS'`
- **THEN** it SHALL pass the error schema

#### Scenario: Login round trip
- **WHEN** a valid guest login request and response are checked against their schemas
- **THEN** both SHALL pass

#### Scenario: Extra field rejected
- **WHEN** a lobby request or response has a property not in its schema
- **THEN** the schema check SHALL fail

### Requirement: Technical nickname rules
A nickname SHALL be 1 to 24 Unicode code points, SHALL equal its own trim,
and SHALL contain only printable code points (no control, format,
surrogate, private-use, unassigned, line- or paragraph-separator code
points), except that U+200C ZWNJ and U+200D ZWJ SHALL be allowed. No other product rule applies. `normalizeNickname` SHALL trim its
input and return it when valid, otherwise `null`.

#### Scenario: Bounds
- **WHEN** nicknames of 0, 1, 24 and 25 code points (including astral characters) are checked
- **THEN** only the 1- and 24-code-point nicknames SHALL be valid

#### Scenario: Joiners allowed
- **WHEN** `👩‍💻`, `👨‍👩‍👧` and a Persian name containing ZWNJ are checked
- **THEN** each SHALL be valid, while a zero-width space (U+200B) SHALL still be rejected

#### Scenario: Untrimmed rejected, normalized accepted
- **WHEN** `' bob '` is checked and normalized
- **THEN** the check SHALL fail and `normalizeNickname` SHALL return `'bob'`
