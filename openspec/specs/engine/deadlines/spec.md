# engine/deadlines Specification

## Purpose
Defines how deadlines bound player commands, how the system resolves an expired deadline with `Timeout`, and how a host learns which deadlines are pending so it can arm timers, including after a restart.

## Requirements

### Requirement: Player commands strictly before the deadline
A player command bound to a target with a deadline (`RollForOrder`, `RollDice`, `EndTurn`) SHALL be accepted only when the context time is strictly less than that deadline. At or after it the engine SHALL reject the command with `DEADLINE_PASSED`, leaving the state unchanged; a late player command never triggers a timeout by itself.

#### Scenario: One millisecond before
- **WHEN** the turn owner issues `RollDice` at `deadline - 1`
- **THEN** the engine SHALL accept it

#### Scenario: At the deadline
- **WHEN** the turn owner issues `RollDice` at exactly `deadline`
- **THEN** the engine SHALL reject it with `DEADLINE_PASSED`

### Requirement: Timeout at or after the deadline
`Timeout` SHALL be issued only by the system actor, with payload `null`, naming a currently pending deadline target in its target expectation. It SHALL be accepted only when the context time is at or after that deadline; before it the engine SHALL reject it with `DEADLINE_NOT_REACHED`. A `Timeout` naming a target that is no longer pending SHALL be rejected with `TARGET_MISMATCH`.

#### Scenario: Timeout boundaries
- **WHEN** `Timeout` for the current turn is issued at `deadline - 1`, `deadline` and `deadline + 1`
- **THEN** the first SHALL be rejected with `DEADLINE_NOT_REACHED` and each of the others, issued against the same state, SHALL be accepted

#### Scenario: Stale timer
- **WHEN** a `Timeout` names a turn that has already closed
- **THEN** the engine SHALL reject it with `TARGET_MISMATCH` and the state unchanged

### Requirement: Timeout before the roll continues the turn
A `Timeout` on a turn that has not rolled SHALL roll for the owner with `auto: true` and apply the roll exactly as `RollDice` would. Unless that roll ended the turn, the same turn SHALL continue with a new deadline 20 000 ms after the `Timeout` time and unchanged quotas, and `TurnContinued` SHALL report it.

#### Scenario: Automatic roll and continuation
- **WHEN** `Timeout` hits an unrolled turn at time T
- **THEN** the turn id SHALL be unchanged, the turn SHALL be rolled, its deadline SHALL be T + 20 000, and its quotas SHALL equal those before

### Requirement: Timeout after the roll closes the turn
A `Timeout` on a rolled turn, including a continued one, SHALL run the mandatory-settlement step and close the turn with reason `timeout`, starting the next turn as `EndTurn` would.

#### Scenario: Idle after rolling
- **WHEN** the owner rolled a non-double and `Timeout` hits the turn
- **THEN** the events SHALL be `TurnEnded { reason: 'timeout' }` followed by `TurnStarted` for the next player

### Requirement: Pending deadlines for the host
The engine SHALL expose a pure function that lists, for any state, every deadline a `Timeout` may resolve as a target and a time. In stage 1 it SHALL list the current `setupRoll` in phase `setup`, the current `turn` in phase `playing`, and nothing in other phases. A `Timeout` built from any listed entry at or after its time SHALL pass the target and deadline checks.

#### Scenario: Deadline listed for the current turn
- **WHEN** the pending deadlines of a `playing` state are requested
- **THEN** the result SHALL be exactly one entry naming the current `turn` target and its deadline

#### Scenario: No deadlines in the lobby
- **WHEN** the pending deadlines of a `lobby` state are requested
- **THEN** the result SHALL be empty
