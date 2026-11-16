## ADDED Requirements

### Requirement: Unsupported stored games fail safely
Opening a core-3 stored game SHALL register a failed room and reject commands with ROOM_UNAVAILABLE without rewriting its game data. Boot recovery SHALL report any active unsupported game as failed and continue restoring healthy games. Closed rooms SHALL remain excluded from boot's active-room scan.

#### Scenario: Active old game at boot
- **WHEN** restoreAll encounters an active core-3 game alongside a healthy core-4 game
- **THEN** it SHALL report the core-3 game as failed, restore the healthy game and preserve the old game's log and snapshots

#### Scenario: Closed old game on demand
- **WHEN** a core-3 game closed by migration 0003 is opened on demand
- **THEN** it SHALL be failed with ROOM_UNAVAILABLE for submitted commands and SHALL NOT crash the process

#### Scenario: Old snapshot or log
- **WHEN** a core-3 game is restored from either a stage 1 snapshot plus tail or a log without a snapshot
- **THEN** both forms SHALL fail safely without modifying stored game data

### Requirement: Stage 2 recovery equality
Recovery SHALL preserve the generated board, economy and every balance exactly through snapshots and ordered log replay.

#### Scenario: Snapshot plus stage 2 tail
- **WHEN** a core-4 game has a snapshot and later moves, including a start crossing, and a fresh manager restores it
- **THEN** its projected board, economy and balances SHALL be deep-equal to the pre-restart projection
