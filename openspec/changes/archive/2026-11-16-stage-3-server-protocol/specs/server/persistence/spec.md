## ADDED Requirements

### Requirement: Stage 2 room retirement
Migration 0004 SHALL set status to closed on every lobby or playing room, leave finished and closed rooms unchanged, and preserve game logs, snapshots and membership. Migration tracking SHALL apply it only once.

#### Scenario: Upgrade from stage 2
- **WHEN** migration 0004 runs on a database migrated through 0003 containing rooms in all four statuses with core-4 data
- **THEN** only lobby and playing statuses SHALL change to closed and logs, snapshots and membership SHALL remain equal

#### Scenario: Repeated migration invocation
- **WHEN** a core-5 room is created after migration 0004 and migrations are invoked again
- **THEN** no migration SHALL execute and the room status and data SHALL remain unchanged
