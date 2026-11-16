# server/persistence Specification

## Purpose
Defines the Postgres schema of the server, how it is migrated, and when state
snapshots are written.

## Requirements

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

### Requirement: Migrations
The schema SHALL be created by plain SQL migration files applied in name
order by Kysely's `Migrator`. Applying them to an empty database SHALL
succeed, and applying them again SHALL change nothing.

#### Scenario: Empty database
- **WHEN** migrations run against a newly created database
- **THEN** all five tables and both unique indexes of `game_log` SHALL exist

#### Scenario: Second run
- **WHEN** migrations run against an already migrated database
- **THEN** the run SHALL succeed and report no executed migration

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

### Requirement: Snapshot policy
A snapshot of the full state SHALL be written at game start (the accepted
command that takes the phase out of `lobby`), at every accepted revision that
is a multiple of 50, and for every live room on clean shutdown. The first two
SHALL be written in the same transaction as the log entry. Writing a snapshot
for a revision that already has one SHALL be a no-op.

#### Scenario: Snapshot at game start
- **WHEN** `StartGame` is accepted at revision R
- **THEN** `game_snapshots` SHALL hold a row for revision R whose state equals the room state

#### Scenario: Snapshot every 50 commands
- **WHEN** a game reaches revision 50
- **THEN** `game_snapshots` SHALL hold a row for revision 50, and none for revisions 49 or 51 unless another rule wrote it

#### Scenario: Snapshot on shutdown
- **WHEN** the manager shuts down with a live room at revision R
- **THEN** `game_snapshots` SHALL hold a row for revision R, and a second shutdown-time write for R SHALL not fail

### Requirement: Stage 1 room retirement
Migration 0003 SHALL set status to closed on every room in lobby or playing. It SHALL leave finished and closed rooms unchanged and SHALL NOT modify game logs, snapshots or membership. The migration SHALL be applied only once through migration tracking.

#### Scenario: Upgrade preview database
- **WHEN** a database migrated through 0002 contains rooms in all four statuses and stage 1 game logs and snapshots, and migration 0003 runs
- **THEN** all previously lobby or playing rooms SHALL be closed, finished and closed rooms SHALL retain their status, and logs, snapshots and membership SHALL be unchanged

#### Scenario: Current games survive repeated migration invocation
- **WHEN** a core-4 room is created after migration 0003 and migrations are invoked again
- **THEN** no migration SHALL execute and that room SHALL retain its status and data
