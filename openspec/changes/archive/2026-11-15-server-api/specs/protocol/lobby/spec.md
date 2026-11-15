# Spec Delta

## Purpose

Extends the lobby schemas with access codes, room lookup, leaving, list
flags and the final room statuses, and tightens the nickname rule.

## MODIFIED Requirements

### Requirement: Lobby operations
The package SHALL export authenticated lobby schemas for guest login, room creation, listing, lookup, joining, leaving and starting, with access codes and room summaries as specified below.

#### Scenario: Lobby shape contract
- **WHEN** the extended lobby operations are checked
- **THEN** these request and response shapes SHALL apply:

The package SHALL export request/response schemas for:
- guest login: request `{ nickname }`, response `{ guestId, token }`;
- create room: request `{ accessCode? }`, response
  `{ room, accessCode?, inviteLink? }`, the last two present together;
- list rooms: response `{ rooms }`;
- get room: path `{ roomId }`, response `{ room }`;
- join room: path `{ roomId }`, request `{ accessCode? }`, response `{ room }`;
- leave room: path `{ roomId }`, response `{ room }`;
- start game (creator only): path `{ roomId }`, response `{ room }`.

`room` is a `RoomSummary { roomId, creatorId, status, locked, joinable,
members }` with `status` one of `lobby`, `playing`, `finished`, `closed`,
boolean `locked` and `joinable`, and `members` a list of
`{ guestId, nickname }`. `roomId` SHALL be the `gameId` a client sends in
`Hello`. An access code SHALL be 4 to 32 characters from `A-Z`, `a-z`,
`0-9`, `_`, `-`. Every object schema SHALL reject unknown properties, except
the request header schema, which only requires its own field.

#### Scenario: Login round trip
- **WHEN** a valid guest login request and response are checked against their schemas
- **THEN** both SHALL pass

#### Scenario: Extra field rejected
- **WHEN** a lobby request or response has a property not in its schema
- **THEN** the schema check SHALL fail

#### Scenario: Access code bounds
- **WHEN** codes `abc`, `abcd`, 32 characters, 33 characters, `ab cd` and `abc/` are checked
- **THEN** only `abcd` and the 32-character code SHALL pass

#### Scenario: Summary flags required
- **WHEN** a summary lacks `locked` or `joinable`, or has status `finished`
- **THEN** the first two SHALL fail and the third SHALL pass

### Requirement: Lobby authentication and errors
Create, list, get, join, leave and start SHALL be authenticated by an
`authorization: Bearer <token>` request header, where `<token>` is the token
from guest login (1-512 visible ASCII characters).

#### Scenario: Detailed Lobby authentication and errors contract
- **WHEN** this requirement is exercised
- **THEN** the following constraints SHALL hold:

Create, list, get, join, leave and start SHALL be authenticated by an
`authorization: Bearer <token>` request header, where `<token>` is the token
from guest login (1-512 visible ASCII characters). Every lobby error response
body SHALL be `{ code, message }`. Lobby codes SHALL be `NOT_ROOM_CREATOR`,
`INVALID_REQUEST`, `ACCESS_CODE_REQUIRED` and `ACCESS_CODE_INVALID`, alongside
the protocol codes `UNAUTHENTICATED`, `NOT_A_PARTICIPANT`, `ROOM_UNAVAILABLE`
and `ROOM_CLOSED`; engine error codes SHALL pass through unchanged.

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
points), except that U+200C ZWNJ and U+200D ZWJ SHALL be allowed inside it.

#### Scenario: Detailed Technical nickname rules contract
- **WHEN** this requirement is exercised
- **THEN** the following constraints SHALL hold:

A nickname SHALL be 1 to 24 Unicode code points, SHALL equal its own trim,
and SHALL contain only printable code points (no control, format,
surrogate, private-use, unassigned, line- or paragraph-separator code
points), except that U+200C ZWNJ and U+200D ZWJ SHALL be allowed inside it.
It SHALL contain at least one code point other than ZWNJ and ZWJ and SHALL
neither start nor end with ZWNJ or ZWJ. No other product rule applies.
`normalizeNickname` SHALL trim its input and return it when valid, otherwise
`null`.

#### Scenario: Bounds
- **WHEN** nicknames of 0, 1, 24 and 25 code points (including astral characters) are checked
- **THEN** only the 1- and 24-code-point nicknames SHALL be valid

#### Scenario: Joiners allowed
- **WHEN** `👩‍💻`, `👨‍👩‍👧` and a Persian name containing ZWNJ are checked
- **THEN** each SHALL be valid, while a zero-width space (U+200B) SHALL still be rejected

#### Scenario: Joiners only or at the edges
- **WHEN** `'‍'`, `'‌‍'`, `'‍bob'` and `'bob‌'` are checked
- **THEN** each SHALL be invalid

#### Scenario: Untrimmed rejected, normalized accepted
- **WHEN** `' bob '` is checked and normalized
- **THEN** the check SHALL fail and `normalizeNickname` SHALL return `'bob'`
