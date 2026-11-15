# Spec Delta

## Purpose

Extends the schema for game end, room closing and access codes, and keeps
status and membership rows in step with the log.

## MODIFIED Requirements

### Requirement: Schema
Postgres SHALL store guests, rooms, membership, the unchanged core log and snapshots, with unique game revision and command IDs, hashed access codes and the four accepted room statuses.

#### Scenario: Database shape contract
- **WHEN** the extended database schema is inspected
- **THEN** the following constraints SHALL hold:

The database SHALL have the tables `guests(id, nickname, token_hash,
created_at)`, `rooms(id, creator_id, status, access_code_hash, created_at)`,
`room_members(room_id, guest_id, joined_at)`, `game_log(game_id, revision,
command_id, entry jsonb)` and `game_snapshots(game_id, revision, state
jsonb)`. `game_log` SHALL be unique on `(game_id, revision)` and on
`(game_id, command_id)`. `game_id` SHALL reference `rooms.id`. `entry` SHALL
hold the core `LogEntry` unchanged and `state` the core `GameState` unchanged.
`rooms.status` SHALL be `lobby`, `playing`, `finished` or `closed`, enforced
by the named check constraint `rooms_status_check`. `access_code_hash` SHALL
be nullable and SHALL never hold a plain access code.

#### Scenario: Revision collision
- **WHEN** a second row with an existing `(game_id, revision)` is inserted
- **THEN** the database SHALL reject it with a unique violation

#### Scenario: Command id collision
- **WHEN** a second row with an existing `(game_id, command_id)` is inserted at a new revision
- **THEN** the database SHALL reject it with a unique violation

#### Scenario: Unknown status
- **WHEN** a room's status is set to a value outside the four statuses
- **THEN** the database SHALL reject it with a check violation

#### Scenario: Log entry round trip
- **WHEN** a log entry is written and read back
- **THEN** its canonical JSON SHALL equal that of the entry the core session recorded

#### Scenario: Upgrade from 0001
- **WHEN** migration 0002 runs on a database migrated to 0001 that holds `lobby` and `playing` rooms
- **THEN** it SHALL succeed, keep the rows, and accept `finished` and `closed`

### Requirement: Room status follows the log
The transaction that persists a log entry SHALL also set `rooms.status` to
`playing` when the entry takes the core phase out of `lobby`, to `finished`
when it takes the phase to `finished`, and to `closed` when the room was
asked to close on it; and SHALL insert and delete `room_members` rows so
that they equal the core player list after the entry.

#### Scenario: Game started
- **WHEN** `StartGame` is accepted for a room with status `lobby`
- **THEN** after the command resolves `rooms.status` SHALL be `playing`

#### Scenario: Start not persisted
- **WHEN** the insert of the `StartGame` entry fails
- **THEN** `rooms.status` SHALL still be `lobby`

#### Scenario: Game finished
- **WHEN** a `Resign` that leaves one active player is accepted
- **THEN** `rooms.status` SHALL be `finished` and a snapshot at that revision SHALL exist

#### Scenario: Members follow the log
- **WHEN** `AddPlayer` and then `LeaveLobby` for another guest are accepted
- **THEN** `room_members` SHALL list exactly the core players after each command, and a failed insert SHALL change no member row
