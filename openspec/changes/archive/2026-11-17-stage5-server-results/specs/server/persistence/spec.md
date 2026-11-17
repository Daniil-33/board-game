# Spec Delta

## ADDED Requirements

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
