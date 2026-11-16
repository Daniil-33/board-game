# Spec Delta

## ADDED Requirements

### Requirement: Stage 3 room retirement
Migration 0005 SHALL close every lobby or playing room, leave finished and closed rooms unchanged, and preserve logs, snapshots and membership. Migration tracking SHALL apply it only once.

#### Scenario: Upgrade from stage 3
- **WHEN** a database migrated through 0004 contains rooms in all four statuses and migration 0005 runs
- **THEN** only lobby and playing statuses SHALL become closed and all game data and membership SHALL remain equal

#### Scenario: Repeated migration invocation
- **WHEN** a core-6 room is created after migration 0005 and migrations run again
- **THEN** no migration SHALL execute and the room status and data SHALL remain unchanged
