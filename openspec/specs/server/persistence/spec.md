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

### Requirement: Stage 2 room retirement
Migration 0004 SHALL set status to closed on every lobby or playing room, leave finished and closed rooms unchanged, and preserve game logs, snapshots and membership. Migration tracking SHALL apply it only once.

#### Scenario: Upgrade from stage 2
- **WHEN** migration 0004 runs on a database migrated through 0003 containing rooms in all four statuses with core-4 data
- **THEN** only lobby and playing statuses SHALL change to closed and logs, snapshots and membership SHALL remain equal

#### Scenario: Repeated migration invocation
- **WHEN** a core-5 room is created after migration 0004 and migrations are invoked again
- **THEN** no migration SHALL execute and the room status and data SHALL remain unchanged

### Requirement: Stage 3 room retirement
Migration 0005 SHALL close every lobby or playing room, leave finished and closed rooms unchanged, and preserve logs, snapshots and membership. Migration tracking SHALL apply it only once.

#### Scenario: Upgrade from stage 3
- **WHEN** a database migrated through 0004 contains rooms in all four statuses and migration 0005 runs
- **THEN** only lobby and playing statuses SHALL become closed and all game data and membership SHALL remain equal

#### Scenario: Repeated migration invocation
- **WHEN** a core-6 room is created after migration 0005 and migrations run again
- **THEN** no migration SHALL execute and the room status and data SHALL remain unchanged

### Requirement: Stage 4 room retirement
Migration 0006 SHALL close every lobby or playing room, leave finished and closed rooms unchanged, and retain logs, snapshots and membership unchanged. Migration tracking SHALL prevent repeat retirement of new rooms.

#### Scenario: Upgrade stage 4 database
- **WHEN** migration 0006 runs on a database through 0005 containing stage 4 rooms in all four statuses
- **THEN** only lobby and playing statuses SHALL change to closed and all game data SHALL remain unchanged

#### Scenario: Repeat migrations
- **WHEN** migrations run again after a new core-7 room is created
- **THEN** that room SHALL remain active and no migration SHALL execute again

### Requirement: Relational game results
Migration 0006 SHALL create game_results with room_id as primary key referencing rooms, rules_version, winner_id, finished_at, final_revision, eliminations jsonb, final_balances jsonb and created_at. Results SHALL preserve the core GameEnded payload without recomputing outcomes.

#### Scenario: Result row contents
- **WHEN** an accepted command emits GameEnded
- **THEN** its result row SHALL identify the room, core rules version, winner, finish time, final revision, ordered eliminations and all final balances

### Requirement: Atomic result persistence before broadcast
An accepted command emitting GameEnded SHALL insert its result in the same transaction as its log append, finished room status and final snapshot. The server SHALL expose and broadcast the accepted state only after commit. Failure SHALL roll back every write and SHALL broadcast no accepted update.

#### Scenario: Final result commit
- **WHEN** bankruptcy or resignation ends a game
- **THEN** before any accepted Update all four writes SHALL be committed and consistent at the final revision

#### Scenario: Result insertion failure
- **WHEN** the database rejects the result insertion
- **THEN** the log, status, snapshot and results SHALL remain unchanged, the command SHALL fail with PERSISTENCE_FAILED, and no accepted Update SHALL be sent

#### Scenario: Final snapshot failure
- **WHEN** final snapshot insertion fails during a game-ending command
- **THEN** the entire transaction SHALL roll back including any result row and no accepted Update SHALL be sent

#### Scenario: Duplicate terminal command
- **WHEN** a successfully committed terminal command is delivered again, including after restart
- **THEN** its original acknowledgement SHALL be returned without another result row, log entry or Update

### Requirement: Chat storage
Migration `0007` SHALL create `chat_messages(room_id, seq, author_id, text, created_at)` with `room_id` referencing `rooms.id`, `author_id` referencing `guests.id`, a primary key on `(room_id, seq)`, a positive `seq` and text of 1-300 characters. Chat rows SHALL survive restarts and room completion and SHALL NOT be part of `game_log` or `game_snapshots`.

#### Scenario: Seq collision
- **WHEN** a second row with an existing `(room_id, seq)` is inserted
- **THEN** the database SHALL reject it with a unique violation

#### Scenario: Upgrade from 0006
- **WHEN** migration 0007 runs on a database migrated to 0006
- **THEN** it SHALL succeed and keep every existing row
