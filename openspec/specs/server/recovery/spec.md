# server/recovery Specification

## Purpose
Defines how rooms are rebuilt from the database at boot and on demand, what
happens when a log does not replay, and what a clean shutdown does.

## Requirements

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

### Requirement: Unsupported stage 3 games fail safely
Opening an unsupported core-5 game SHALL fail with ROOM_UNAVAILABLE without rewriting its logs or snapshots or arming timers. Closed rooms SHALL remain excluded from boot recovery and SHALL answer ROOM_CLOSED at the socket boundary.

#### Scenario: Unsupported finished game
- **WHEN** a finished core-5 game is opened
- **THEN** recovery SHALL fail safely and all persisted game data SHALL remain unchanged

### Requirement: Stage 4 recovery equality
Recovery SHALL preserve the full core-6 state including houses, open rent, balances and turn quotas exactly through snapshot plus ordered tail. Reconnecting members SHALL receive their current core projection.

#### Scenario: Open settlement restart
- **WHEN** a server restarts with an open rent settlement before its turn deadline
- **THEN** restored state and reconnect Welcome views SHALL equal the committed state and corresponding projections

#### Scenario: Used building quota restart
- **WHEN** a server restarts after an accepted build
- **THEN** houses, balances, remaining build quota and full state SHALL remain equal

#### Scenario: Snapshot before stage 4 changes
- **WHEN** crash-style recovery reads a snapshot before rent opens or a house is built and a tail containing that change
- **THEN** full recovered state SHALL equal the original without requiring a shutdown snapshot

### Requirement: Stage 5 mortgage recovery equality
Recovery SHALL preserve the full core-7 state including mortgages, pending players and lapsCompleted from snapshots plus ordered log replay. Reconnected players SHALL receive the matching public projection and the next turn boundary SHALL behave identically.

#### Scenario: Mortgage restart
- **WHEN** a server restarts with mortgages in place before the next deadline
- **THEN** restored state and all three guest Welcome views SHALL equal their committed counterparts

#### Scenario: Mortgage log tail and next boundary
- **WHEN** a fresh server restores a snapshot and tail that changed mortgage progress
- **THEN** its full state and next boundary state and events SHALL equal uninterrupted execution, including expiry at eight laps

### Requirement: Finished core-7 room reload
A finished core-7 room SHALL remain loadable on demand by its existing members, including eliminated players. Its final view SHALL contain the core result with winner, finishedAt, ordered eliminations and all finalBalances. Finished rooms SHALL arm no gameplay timers.

#### Scenario: Restart and reconnect after game end
- **WHEN** a server restarts after a terminal bankruptcy and any of its three guests reconnects
- **THEN** Welcome SHALL contain the same final projection and result as before restart, the relational result SHALL remain unchanged, and no timer SHALL be armed

### Requirement: Unsupported stage 4 games fail safely
Unsupported core-6 games SHALL fail recovery without rewriting stored data or arming timers. Rooms closed by migration 0006 SHALL be excluded from boot recovery and SHALL answer ROOM_CLOSED at the socket boundary.

#### Scenario: Legacy closed room reconnect
- **WHEN** a guest sends Hello for a stage 4 room retired by migration 0006
- **THEN** the server SHALL return ROOM_CLOSED without modifying game data
