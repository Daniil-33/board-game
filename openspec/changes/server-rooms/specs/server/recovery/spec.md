# Spec Delta

## Purpose

Defines how rooms are rebuilt from the database at boot and on demand, what
happens when a log does not replay, and what a clean shutdown does.

## ADDED Requirements

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
