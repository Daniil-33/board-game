# server/rooms Specification

## Purpose
Defines how one room executes commands for one game: serially, through the
game-core session, persisting every accepted command before anyone observes
it.

## Requirements

### Requirement: Serial execution in arrival order
A room SHALL execute the commands of its game one at a time, in the order
`submit` was called, including system commands issued by its own timers. The
transition time of a submitted command SHALL be the clock value at the moment
`submit` was called.

#### Scenario: Concurrent submits
- **WHEN** several commands are submitted to one room without awaiting each other
- **THEN** their results SHALL resolve in submission order and the log revisions of the accepted ones SHALL be consecutive in that order

### Requirement: Execute, persist, then emit
For each command the room SHALL run the core session, and if the command is
accepted SHALL insert its log entry into `game_log`. Only after that insert
has committed SHALL the room notify subscribers, expose the new state through
`Room.state`, and resolve the command as accepted. A rejected command SHALL
persist nothing and notify no subscriber.

#### Scenario: Subscriber sees only committed state
- **WHEN** a subscriber is notified of an update at revision R
- **THEN** a query of `game_log` made inside that notification SHALL find the entry with revision R

#### Scenario: Insert still in flight
- **WHEN** a command was accepted by the core and its insert has not committed yet
- **THEN** no subscriber SHALL have been notified and `Room.state` SHALL still be the previous state

#### Scenario: Rejected command
- **WHEN** the core rejects a command
- **THEN** the result SHALL carry the core's error code, `game_log` SHALL be unchanged and no subscriber SHALL be notified

### Requirement: Persistence failure
On any accepted-command insert failure the room SHALL reload its persisted state, reject with PERSISTENCE_FAILED and never broadcast unpersisted state. It SHALL resync changed persisted revisions and become failed if reload fails.

#### Scenario: Persistence recovery detail contract
- **WHEN** this requirement is exercised
- **THEN** the following constraints SHALL hold:

When the insert of an accepted command fails for any reason, including a
violation of the unique `(game_id, revision)` or `(game_id, command_id)`
index, the room SHALL reload its session from the database and SHALL report
the command as rejected with code `PERSISTENCE_FAILED`. No subscriber SHALL
receive the unpersisted state. If the reloaded revision differs from the last
revision subscribers were given, the room SHALL notify them with a `resync`
carrying the reloaded state. If the reload fails, the room SHALL become
`failed`.

#### Scenario: Failing insert
- **WHEN** the insert of an accepted command throws
- **THEN** the result SHALL be rejected with `PERSISTENCE_FAILED`, no `update` SHALL be emitted, and `Room.state` SHALL be deep-equal to the state rebuilt from the database

#### Scenario: Second writer took the revision
- **WHEN** another writer has committed revision N+1 for the game and the room, still at revision N, accepts a command
- **THEN** the result SHALL be rejected with `PERSISTENCE_FAILED`, the room SHALL be at the other writer's revision N+1, subscribers SHALL receive a `resync` at N+1, and `game_log` SHALL hold exactly one entry at N+1

### Requirement: Faults never escape or stall the room
When the room cannot check a command against the log, the command SHALL be
rejected with `PERSISTENCE_FAILED` without being executed and the room SHALL
stay `live`. When the engine throws, the command SHALL be rejected with
`ROOM_UNAVAILABLE`, the state SHALL be unchanged and the room SHALL stay
`live`.

#### Scenario: Lookup fails
- **WHEN** the command id lookup throws
- **THEN** the result SHALL be rejected with `PERSISTENCE_FAILED`, `game_log` SHALL be unchanged, no subscriber SHALL be notified, and the next command SHALL be executed normally

### Requirement: Duplicate delivery
Resubmitting a `commandId` that is already in the game's log with the same
type, actor, expectation and payload SHALL return the original accepted
result (its revision and events) marked as a duplicate, SHALL persist
nothing and SHALL notify no subscriber. This SHALL hold after a process
restart and for commands logged before the latest snapshot. The same
`commandId` with a different body SHALL be rejected with
`COMMAND_ID_CONFLICT`.

#### Scenario: Same command twice
- **WHEN** an accepted command is submitted again unchanged
- **THEN** the result SHALL be accepted with the original revision and events and `duplicate: true`, and the row count of `game_log` SHALL be unchanged

#### Scenario: Duplicate after restart
- **WHEN** a command is accepted, the room is rebuilt from the database by a new manager, and the command is submitted again
- **THEN** the result SHALL equal the original one with `duplicate: true` and nothing SHALL be written

#### Scenario: Reused id, different body
- **WHEN** a logged `commandId` is submitted with a different payload or expectation
- **THEN** the result SHALL be rejected with `COMMAND_ID_CONFLICT`

### Requirement: Server-supplied context
The room SHALL take `now` from an injectable clock and `entropy` from an
injectable entropy source for every command. The production entropy source
SHALL draw 128 bits from `crypto.randomBytes`. The room SHALL NOT take time
or entropy from the submitted command.

#### Scenario: Deterministic sources
- **WHEN** two rooms are driven with the same commands, the same fake clock values and the same deterministic entropy source
- **THEN** their states and logs SHALL be deep-equal

#### Scenario: Production entropy
- **WHEN** the production entropy source is asked twice
- **THEN** each value SHALL be a valid core `Entropy` of four uint32 words and the two SHALL differ

### Requirement: Unavailable room
A room that is `failed` or `closed` SHALL reject every submitted command with
`ROOM_UNAVAILABLE` without executing it. `submit` SHALL never throw.

#### Scenario: Submit to a failed room
- **WHEN** a command is submitted to a room marked failed
- **THEN** the result SHALL be rejected with `ROOM_UNAVAILABLE` and nothing SHALL be written

### Requirement: No rule logic in the room
The room SHALL decide the outcome of a command only by calling the core. It
SHALL read from the state only the revision, the phase and the result of
`pendingDeadlines`.

#### Scenario: Engine substitution
- **WHEN** a room is created with a different engine over the same state type
- **THEN** it SHALL execute, persist and emit that engine's results without code changes

### Requirement: Closing a room
`Room.submit(command, { closeRoom: true })` SHALL, when the command is
accepted and not a duplicate, set `rooms.status` to `closed` in the
transaction of its log entry, emit the `update` and then a `closed` event,
and reject every later command with `ROOM_UNAVAILABLE`. On a rejected or
duplicate command the option SHALL have no effect.

#### Scenario: Close on accept
- **WHEN** an accepted command is submitted with `closeRoom`
- **THEN** subscribers SHALL get `update` then `closed`, `rooms.status` SHALL be `closed`, and the next submit SHALL be rejected with `ROOM_UNAVAILABLE`

#### Scenario: Close on reject
- **WHEN** a command the core rejects is submitted with `closeRoom`
- **THEN** the room SHALL stay live and `rooms.status` SHALL be unchanged
