# Spec Delta

## MODIFIED Requirements

### Requirement: Restore from snapshot and tail
A room SHALL be rebuilt from the snapshot with the highest revision for its game plus every log entry with a higher revision, in revision order, through the core's restoreSession. Before restoration, a core-7 snapshot SHALL be upgraded in memory to core-8. A game without a snapshot SHALL be rebuilt from the genesis state and its whole log.

#### Scenario: Restored state equals live state
- **WHEN** a game is played past a snapshot, and a new manager on the same database restores it
- **THEN** the restored room's state SHALL be deep-equal to the state of the original room

#### Scenario: No snapshot
- **WHEN** a game in the lobby has log entries and no snapshot
- **THEN** the restored state SHALL be deep-equal to the original

#### Scenario: New room
- **WHEN** a room row exists with no log entries and the room is opened
- **THEN** its state SHALL be the genesis state

#### Scenario: Upgrade a core-7 snapshot
- **WHEN** a room loads a core-7 snapshot containing an interim prisoner and a mortgage
- **THEN** recovery SHALL preserve jail attempts and mortgage terms, set the core-8 neutral fields, and continue loading the room without a SQL migration or room closure

#### Scenario: Replay a current-rule tail after upgrade
- **WHEN** new core-8 commands follow the legacy snapshot and the server restarts without writing a shutdown snapshot
- **THEN** recovery SHALL upgrade the snapshot, replay the tail and reproduce the exact live state and events

#### Scenario: Diverging legacy tail
- **WHEN** replaying a tail recorded under core-7 diverges after upgrading its snapshot
- **THEN** recovery SHALL mark the room failed and log the error without changing stored game rows
