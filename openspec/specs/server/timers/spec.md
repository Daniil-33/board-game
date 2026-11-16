# server/timers Specification

## Purpose
Defines how a room turns the core's pending deadlines into timers and system
`Timeout` commands.

## Requirements

### Requirement: One timer per pending deadline
After every committed transition, after a restore and after a reload, the
room SHALL cancel its timers and arm exactly one timer per entry of
`pendingDeadlines(state)`, due at that entry's time. A command rejected
without a reload SHALL leave the timers unchanged. No command other than a
failed `Timeout` SHALL cause a deadline's timer to be due later than the
deadline.

#### Scenario: Failing commands near a deadline
- **WHEN** commands whose lookup or insert fails are submitted repeatedly just before a deadline
- **THEN** the timer SHALL stay due at the deadline and the `Timeout` SHALL be accepted with `now` equal to it

#### Scenario: Timers follow the state
- **WHEN** a command moves the game from one turn to the next
- **THEN** the room SHALL hold exactly one armed timer, due at the new turn's deadline

#### Scenario: No deadlines in the lobby
- **WHEN** the game is in phase `lobby`
- **THEN** the room SHALL hold no armed timer

### Requirement: Timeout on firing
When a timer fires and the clock is at or after its deadline, the room SHALL
submit, through the same serial pipeline as any command, a `Timeout` with the
system actor, payload `null`, `expected: { kind: 'target', target }` for the
timer's target and a context time at or after the deadline. A timer that
fires before its deadline SHALL be re-armed instead. The command id of each
`Timeout` SHALL be freshly generated.

#### Scenario: Deadline reached
- **WHEN** the fake clock advances to a turn's deadline with no player command
- **THEN** the log SHALL gain a `Timeout` entry for that turn with `now` at or after the deadline, subscribers SHALL receive its update, and a timer for the next pending deadline SHALL be armed

#### Scenario: One millisecond early
- **WHEN** the fake clock advances to one millisecond before the deadline
- **THEN** no `Timeout` SHALL be in the log

#### Scenario: Continuation
- **WHEN** a `Timeout` on an unrolled turn extends the same turn and the clock then reaches the new deadline
- **THEN** a second `Timeout` for the same turn target SHALL be accepted

### Requirement: A failed Timeout is retried
When a `Timeout` issued by a timer does not resolve its deadline (its write
or lookup failed, or it was otherwise not accepted) and that deadline is
still pending, the room SHALL arm a timer for it again, due no earlier than
1000 ms after the failure.

#### Scenario: Insert fails, then works
- **WHEN** the insert of a timer's `Timeout` fails and the clock then advances by 1000 ms with the database working
- **THEN** no `Timeout` SHALL be in the log before those 1000 ms have passed, and one SHALL be accepted when they have

### Requirement: Stale timers are harmless
A `Timeout` for a target that is no longer pending SHALL be rejected by the
core and SHALL change neither the state, the log nor the armed timers.

#### Scenario: Player acted first
- **WHEN** a player command resolves a target and a `Timeout` for that same target is then submitted
- **THEN** it SHALL be rejected with `TARGET_MISMATCH` and `game_log` SHALL be unchanged

### Requirement: Overdue deadlines fire immediately
A deadline that is already in the past when timers are armed SHALL fire
without waiting for further clock advance.

#### Scenario: Overdue after restore
- **WHEN** a room is restored while the clock is past the pending deadline
- **THEN** a `Timeout` for that target SHALL be accepted and persisted without advancing the clock

### Requirement: Auction timers follow state
During an auction the room SHALL arm only the pending auctionResponse deadline, with no paused turn timer. After resolution the room SHALL arm the resumed or next turn deadline from pendingDeadlines. Timers SHALL follow the same contract after recovery.

#### Scenario: Choice pauses and resumes
- **WHEN** StartAuction pauses a turn with remaining time and the auction resolves
- **THEN** only response timers SHALL be armed during the auction, and the resumed turn timer SHALL be due at resolution time plus the persisted remaining time

#### Scenario: Response expires
- **WHEN** the clock reaches the 10 second response deadline
- **THEN** a system Timeout for that response target SHALL persist the automatic pass and re-arm the next pending deadline

#### Scenario: Turn deadline starts auction
- **WHEN** a turn deadline expires with a pending purchase decision
- **THEN** the auction SHALL run on response deadlines and the turn SHALL close after resolution

#### Scenario: Overdue response at boot
- **WHEN** the server boots after a persisted response deadline
- **THEN** that response Timeout SHALL be persisted without further clock advance and subsequent timers SHALL follow the recovered state
