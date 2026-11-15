# server/lobby Specification

## Purpose
Defines the HTTP lobby: creating, listing, inspecting, joining, leaving and
starting rooms, and room access codes.

## Requirements

### Requirement: Create room
`POST /api/rooms { accessCode? }` SHALL create a room in status `lobby` with
the caller as creator, submit core `CreateGame` with a CSPRNG seed and the
current rules version, then `AddPlayer` for the caller, and answer 201 with
the room summary. With an access code the server SHALL store only a salted
slow hash of it, the room SHALL be locked, and the response SHALL include
the code and an invite link that carries the room id and the code.

#### Scenario: Open room
- **WHEN** a guest creates a room without a code
- **THEN** the summary SHALL have status `lobby`, `locked: false`, `joinable: true` and the creator as the only member, and the response SHALL have no `accessCode` or `inviteLink`

#### Scenario: Locked room
- **WHEN** a guest creates a room with code `abcd`
- **THEN** the response SHALL carry `accessCode: 'abcd'` and an `inviteLink` containing the room id and `abcd`, the summary SHALL have `locked: true`, and no column of `rooms` SHALL contain `abcd`

### Requirement: Room list
`GET /api/rooms` SHALL list every room in status `lobby` or `playing` that
has a member, and every `finished` room the caller is a member of. `closed`
rooms SHALL never be listed. `joinable` SHALL be true exactly for a room in
`lobby` without an access code and with fewer than six members; `locked`
SHALL be true exactly for a room with an access code.

#### Scenario: Statuses in the list
- **WHEN** rooms exist in `lobby`, `playing`, `finished` (caller a member), `finished` (caller not a member) and `closed`
- **THEN** the list SHALL contain the first three only, with `joinable` true only for the unlocked lobby room with free seats

### Requirement: Get room
`GET /api/rooms/:roomId` SHALL return the summary, with members and
nicknames, to any member in any status. A non-member SHALL get 403
`NOT_A_PARTICIPANT` and an unknown room 404 `ROOM_UNAVAILABLE`.

#### Scenario: Late joiner nickname
- **WHEN** a member requests a room another guest joined after it
- **THEN** the summary SHALL list that guest with its nickname

### Requirement: Join room
`POST /api/rooms/:roomId/join { accessCode? }` (a missing body counts as
`{}`) SHALL add the caller through core `AddPlayer` while the room is in
`lobby`. A locked room SHALL require the code: none -> 403
`ACCESS_CODE_REQUIRED`, wrong -> 403 `ACCESS_CODE_INVALID`. A closed room
SHALL be answered 409 `ROOM_CLOSED`; a room past `lobby` and a full room
SHALL be answered 409 with the engine code. Joining a room one is already a
member of SHALL return the summary unchanged.

#### Scenario: Right and wrong code
- **WHEN** a guest joins a locked room without a code, with a wrong code, then with the right code
- **THEN** the answers SHALL be `ACCESS_CODE_REQUIRED`, `ACCESS_CODE_INVALID`, then 200 with the guest among the members

#### Scenario: Seventh guest
- **WHEN** a seventh guest joins a room with six members
- **THEN** the response SHALL be 409 with the engine code and the members SHALL be unchanged

### Requirement: Leave room before start
The authenticated leave route SHALL remove a lobby participant through LeaveLobby and return the updated summary; after start it SHALL reject with the core phase error.

#### Scenario: Leave detail contract
- **WHEN** this requirement is exercised
- **THEN** the following constraints SHALL hold:

`POST /api/rooms/:roomId/leave` SHALL, while the room is in `lobby`, remove a
member through core `LeaveLobby` and answer with the summary. When the
caller is the creator the room SHALL become `closed` in the same transaction
as the log entry, connected members SHALL receive the final `Update` and a
`ROOM_CLOSED` notice, and the room SHALL leave the list. After the start the
route SHALL answer 409 with the engine phase code (resignation is the socket
command `Resign`). A non-member SHALL get 403 `NOT_A_PARTICIPANT`.

#### Scenario: Member leaves
- **WHEN** a non-creator member leaves a lobby room
- **THEN** the summary SHALL no longer list them and the room SHALL stay in the list

#### Scenario: Creator leaves
- **WHEN** the creator leaves a lobby room with another member connected
- **THEN** `rooms.status` SHALL be `closed`, the other member SHALL receive `Update` then `Error ROOM_CLOSED`, a later join SHALL get `ROOM_CLOSED`, and the room SHALL not be listed

### Requirement: Start game
`POST /api/rooms/:roomId/start` SHALL submit core `StartGame` when the caller
is the creator, and answer with the summary in status `playing`. A
non-creator SHALL get 403 `NOT_ROOM_CREATOR`; fewer than two members SHALL
be answered 409 with the engine code.

#### Scenario: Creator alone
- **WHEN** the creator starts a room with one member
- **THEN** the response SHALL be 409 with code `NOT_ENOUGH_PLAYERS`

### Requirement: Strict request validation
Lobby request bodies SHALL be validated without removing unknown properties
and without type coercion; the nickname format SHALL be the protocol's.
Invalid JSON or a schema violation SHALL be answered 400 `INVALID_REQUEST`.
Error responses SHALL be `{ code, message }` and SHALL NOT echo an access
code or token.

#### Scenario: Unknown property
- **WHEN** guest login is posted with `{ nickname: 'bob', admin: true }`
- **THEN** the response SHALL be 400 `INVALID_REQUEST` and no guest SHALL be created

#### Scenario: No coercion
- **WHEN** a join body is `{ accessCode: 1234 }`
- **THEN** the response SHALL be 400 `INVALID_REQUEST`
