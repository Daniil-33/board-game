## MODIFIED Requirements

### Requirement: Unsupported stored games fail safely
Opening a core-3 or core-4 stored game SHALL register a failed room and reject commands with ROOM_UNAVAILABLE without rewriting its game data. Boot recovery SHALL report any active unsupported game as failed and continue restoring healthy games. Closed rooms SHALL remain excluded from boot's active-room scan.

#### Scenario: Active old game at boot
- **WHEN** restoreAll encounters an active core-3 game alongside a healthy core-5 game
- **THEN** it SHALL report the core-3 game as failed, restore the healthy game and preserve the old game's log and snapshots

#### Scenario: Closed old game on demand
- **WHEN** a core-3 game closed by migration 0003 is opened on demand
- **THEN** it SHALL be failed with ROOM_UNAVAILABLE for submitted commands and SHALL NOT crash the process

#### Scenario: Old snapshot or log
- **WHEN** a core-3 game is restored from either a stage 1 snapshot plus tail or a log without a snapshot
- **THEN** both forms SHALL fail safely without modifying stored game data


#### Scenario: Unsupported stage 2 snapshot or log
- **WHEN** a core-4 game is opened from its snapshot plus tail or its whole log
- **THEN** it SHALL register as failed, reject commands with ROOM_UNAVAILABLE, arm no timers and preserve all stored data

## ADDED Requirements

### Requirement: Stage 3 recovery equality
Recovery SHALL preserve the full core-5 state, including purchase, auction, owners, balances and paused turn remainder, through snapshots and ordered log replay. Reconnecting members SHALL receive their current projection after recovery.

#### Scenario: Decision and auction recovery
- **WHEN** a server restarts during a pending decision or a running auction before its deadline
- **THEN** the restored state SHALL equal the committed state, reconnect Welcome views SHALL equal the matching pre-restart projections, and timers SHALL follow pendingDeadlines

#### Scenario: Snapshot and tail coverage
- **WHEN** a crash-style restore reads a snapshot before a decision or auction and a tail entering that phase
- **THEN** the full restored state SHALL equal the original state without depending on a shutdown snapshot
