# server/recovery Specification

## Purpose
Defines how rooms are rebuilt from the database at boot and on demand, what
happens when a log does not replay, and what a clean shutdown does.

## Requirements

### Requirement: Restore from snapshot and tail
A room SHALL be rebuilt from the snapshot with the highest revision for its
game plus every log entry with a higher revision, in revision order, through
the core's `restoreSession`. A game without a snapshot SHALL be rebuilt from
the genesis state and its whole log.

#### Scenario: Restored state equals live state
- **WHEN** a game is played past a snapshot, and a new manager on the same database restores it
- **THEN** the restored room's state SHALL be deep-equal to the state of the original room

#### Scenario: No snapshot
- **WHEN** a game in the lobby has log entries and no snapshot
- **THEN** the restored state SHALL be deep-equal to the original

#### Scenario: New room
- **WHEN** a room row exists with no log entries and the room is opened
- **THEN** its state SHALL be the genesis state

### Requirement: Boot restores every active room
On boot the manager SHALL restore every room whose status is `lobby` or
`playing` and SHALL arm their timers.

#### Scenario: Several rooms
- **WHEN** the database holds two active rooms at different revisions and a manager boots
- **THEN** both SHALL be live at their persisted revisions

### Requirement: Divergence is a hard error for that room
When rebuilding a room fails (the tail does not replay, the snapshot violates
an invariant, or a row is malformed) the room SHALL be marked `failed` and
the failure SHALL be logged with the game id and reason. The room SHALL NOT
be reset, its rows SHALL NOT be modified, and other rooms SHALL still be
restored.

#### Scenario: Tampered log entry
- **WHEN** a stored log entry's events are altered and the manager boots
- **THEN** that room SHALL be `failed`, the error log SHALL name the game id, `game_log` and `game_snapshots` for it SHALL be unchanged, and a healthy second room SHALL be live

### Requirement: An unreadable room is retried
When a room cannot be read from the database at boot, the failure SHALL be
logged and reported, the room SHALL NOT be registered as failed, and a later
`open` SHALL load it.

#### Scenario: Database error for one room at boot
- **WHEN** loading one room fails with a database error during `restoreAll` and the database then recovers
- **THEN** `restoreAll` SHALL list that room as failed and the others as restored, and a later `open` of it SHALL return a live room

### Requirement: Unknown room
Opening a game id without a `rooms` row SHALL fail with a room-not-found
error and SHALL create nothing.

#### Scenario: Missing row
- **WHEN** `open` is called with an id that is not in `rooms`
- **THEN** it SHALL reject with `RoomNotFoundError`

### Requirement: Clean shutdown
Shutdown SHALL stop accepting commands, let every already submitted command
finish, cancel all timers, and write a snapshot for every live room. Commands
submitted after shutdown was requested SHALL be rejected with
`ROOM_UNAVAILABLE`, and opening a room SHALL fail with a manager-closed error
carrying that code.

#### Scenario: Shutdown during a command
- **WHEN** shutdown is requested while a command's insert is in flight
- **THEN** that command SHALL resolve as accepted, its entry SHALL be in `game_log`, and the shutdown snapshot SHALL be at its revision

#### Scenario: No timer after shutdown
- **WHEN** the clock passes a deadline after shutdown
- **THEN** no `Timeout` SHALL be written

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

### Requirement: Stage 2 recovery equality
Recovery SHALL preserve the generated board, economy and every balance exactly through snapshots and ordered log replay.

#### Scenario: Snapshot plus stage 2 tail
- **WHEN** a core-4 game has a snapshot and later moves, including a start crossing, and a fresh manager restores it
- **THEN** its projected board, economy and balances SHALL be deep-equal to the pre-restart projection

### Requirement: Stage 3 recovery equality
Recovery SHALL preserve the full core-5 state, including purchase, auction, owners, balances and paused turn remainder, through snapshots and ordered log replay. Reconnecting members SHALL receive their current projection after recovery.

#### Scenario: Decision and auction recovery
- **WHEN** a server restarts during a pending decision or a running auction before its deadline
- **THEN** the restored state SHALL equal the committed state, reconnect Welcome views SHALL equal the matching pre-restart projections, and timers SHALL follow pendingDeadlines

#### Scenario: Snapshot and tail coverage
- **WHEN** a crash-style restore reads a snapshot before a decision or auction and a tail entering that phase
- **THEN** the full restored state SHALL equal the original state without depending on a shutdown snapshot
