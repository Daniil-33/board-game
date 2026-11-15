# Spec Delta

## Purpose

Defines the Postgres schema of the server, how it is migrated, and when state
snapshots are written.

## ADDED Requirements

### Requirement: Schema
Postgres SHALL store guests, rooms, membership, the unchanged core log and snapshots, with unique game revision and command IDs and a replaceable named room-status constraint.

#### Scenario: Database shape contract
- **WHEN** this requirement is exercised
- **THEN** the following constraints SHALL hold:

The database SHALL have the tables `guests(id, nickname, token_hash,
created_at)`, `rooms(id, creator_id, status, created_at)`,
`room_members(room_id, guest_id, joined_at)`, `game_log(game_id, revision,
command_id, entry jsonb)` and `game_snapshots(game_id, revision, state
jsonb)`. `game_log` SHALL be unique on `(game_id, revision)` and on
`(game_id, command_id)`. `game_id` SHALL reference `rooms.id`. `entry` SHALL
hold the core `LogEntry` unchanged and `state` the core `GameState` unchanged.
`rooms.status` SHALL be `lobby` or `playing`, enforced by a named check
constraint that a later migration can replace.

#### Scenario: Revision collision
- **WHEN** a second row with an existing `(game_id, revision)` is inserted
- **THEN** the database SHALL reject it with a unique violation

#### Scenario: Command id collision
- **WHEN** a second row with an existing `(game_id, command_id)` is inserted at a new revision
- **THEN** the database SHALL reject it with a unique violation

#### Scenario: Unknown status
- **WHEN** a room's status is set to a value other than `lobby` or `playing`
- **THEN** the database SHALL reject it with a check violation

#### Scenario: Log entry round trip
- **WHEN** a log entry is written and read back
- **THEN** its canonical JSON SHALL equal that of the entry the core session recorded

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
The transaction that persists the log entry taking the game out of the core
phase `lobby` SHALL set `rooms.status` to `playing`.

#### Scenario: Game started
- **WHEN** `StartGame` is accepted for a room with status `lobby`
- **THEN** after the command resolves `rooms.status` SHALL be `playing`

#### Scenario: Start not persisted
- **WHEN** the insert of the `StartGame` entry fails
- **THEN** `rooms.status` SHALL still be `lobby`

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
