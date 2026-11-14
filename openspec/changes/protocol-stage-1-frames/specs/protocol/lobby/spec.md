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
`{ guestId, nickname }`. Every object schema SHALL reject unknown properties.

#### Scenario: Login round trip
- **WHEN** a valid guest login request and response are checked against their schemas
- **THEN** both SHALL pass

#### Scenario: Extra field rejected
- **WHEN** a lobby request has a property not in its schema
- **THEN** the schema check SHALL fail

### Requirement: Technical nickname rules
A nickname SHALL be 1 to 24 Unicode code points, SHALL equal its own trim,
and SHALL contain only printable code points (no control, format,
surrogate, private-use, unassigned, line- or paragraph-separator code
points). No other product rule applies. `normalizeNickname` SHALL trim its
input and return it when valid, otherwise `null`.

#### Scenario: Bounds
- **WHEN** nicknames of 0, 1, 24 and 25 code points (including astral characters) are checked
- **THEN** only the 1- and 24-code-point nicknames SHALL be valid

#### Scenario: Untrimmed rejected, normalized accepted
- **WHEN** `' bob '` is checked and normalized
- **THEN** the check SHALL fail and `normalizeNickname` SHALL return `'bob'`
