## ADDED Requirements

### Requirement: Stage 1 room retirement
Migration 0003 SHALL set status to closed on every room in lobby or playing. It SHALL leave finished and closed rooms unchanged and SHALL NOT modify game logs, snapshots or membership. The migration SHALL be applied only once through migration tracking.

#### Scenario: Upgrade preview database
- **WHEN** a database migrated through 0002 contains rooms in all four statuses and stage 1 game logs and snapshots, and migration 0003 runs
- **THEN** all previously lobby or playing rooms SHALL be closed, finished and closed rooms SHALL retain their status, and logs, snapshots and membership SHALL be unchanged

#### Scenario: Current games survive repeated migration invocation
- **WHEN** a core-4 room is created after migration 0003 and migrations are invoked again
- **THEN** no migration SHALL execute and that room SHALL retain its status and data
