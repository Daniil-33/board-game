# engine/session Specification

## Purpose

Defines how a game's current state is held across commands: the ordered log of accepted commands, idempotent handling of repeated `commandId`s, and deterministic replay of the log into identical state and events. The session performs no I/O.

## Requirements

### Requirement: Session holds current state
A session SHALL start from the genesis state with an empty log. For each submitted command it SHALL execute the command against its current state, and SHALL replace its current state with the result's state only when the command is accepted.

#### Scenario: Accepted command advances the session
- **WHEN** a command is submitted and accepted
- **THEN** the session's current state SHALL equal the accepted result's state

#### Scenario: Rejected command leaves the session unchanged
- **WHEN** a command is submitted and rejected
- **THEN** the session's current state SHALL be reference-equal to its state before submission

### Requirement: Accepted-command log
The session SHALL append one log entry per accepted command, in acceptance order. Each entry SHALL record the command, the context time, the context entropy, the revision it produced, and the events it produced. Rejected commands SHALL NOT be logged.

#### Scenario: Log after mixed submissions
- **WHEN** three commands are submitted and the second is rejected
- **THEN** the log SHALL contain exactly two entries, for the first and third commands, with revisions 1 and 2

#### Scenario: Entry contents
- **WHEN** a command is accepted at context time T with context entropy X and produces events E
- **THEN** its log entry SHALL contain that command, time T, entropy X, the new revision, and events E in order

### Requirement: Repeated command returns the original result
When a submitted command has the same `commandId` and the same fingerprint as a logged command, the session SHALL return that command's original accepted result. It SHALL NOT execute the command again, change state, or append to the log. The fingerprint SHALL be `type`, `actor`, `expected` and payload. The context, including its entropy, SHALL NOT be part of the fingerprint.

#### Scenario: Duplicate delivery
- **WHEN** an already-accepted command is submitted again with identical content
- **THEN** the session SHALL return an accepted result with the original revision and events, and the log length and current state SHALL be unchanged

#### Scenario: Duplicate delivery with fresh entropy
- **WHEN** an already-accepted command is submitted again with identical content but a context carrying different entropy
- **THEN** the session SHALL return the original accepted result and its state, including the RNG state, SHALL be unchanged

### Requirement: Command id conflict
When a submitted command has the `commandId` of a logged command but a different fingerprint, the session SHALL reject it with `COMMAND_ID_CONFLICT`, without executing it.

#### Scenario: Same id, different payload
- **WHEN** a command is submitted reusing a logged `commandId` with a different payload
- **THEN** the session SHALL return a `RejectedResult` with code `COMMAND_ID_CONFLICT` and leave its state and log unchanged

### Requirement: Rejected command ids are not remembered
A `commandId` whose command was rejected SHALL NOT be reserved. A later submission with that id SHALL be executed normally.

#### Scenario: Retry after rejection
- **WHEN** a command is rejected and then submitted again with the same `commandId` and a now-matching `expectedRevision`
- **THEN** the session SHALL execute it through the engine rather than return `COMMAND_ID_CONFLICT` or a cached result

### Requirement: Payload must be plain data
A command payload SHALL be plain JSON-compatible data: null, booleans, finite numbers, strings, arrays and plain objects. Payload key order SHALL NOT affect the fingerprint.

#### Scenario: Key order is irrelevant
- **WHEN** a logged command is resubmitted with the same payload fields in a different key order
- **THEN** the session SHALL treat it as a duplicate, not a conflict

#### Scenario: Non-plain payload rejected
- **WHEN** a command whose payload contains a function, `undefined`, or a non-finite number is submitted
- **THEN** the session SHALL reject it with `INVALID_PAYLOAD`

### Requirement: Deterministic replay
Replaying a log SHALL start from the genesis state and execute each entry's command with that entry's context time and entropy. It SHALL produce a state and a per-entry event sequence deep-equal to those originally recorded.

#### Scenario: Replay reproduces the session
- **WHEN** a session's log is replayed
- **THEN** the replayed final state, including its RNG state, SHALL be deep-equal to the session's current state, and every entry's events SHALL be deep-equal to the recorded events

#### Scenario: Replay result is usable as a session
- **WHEN** a log is replayed into a new session and further commands are submitted to it
- **THEN** that session SHALL behave identically to the original session receiving the same commands, including deduplication of logged command ids

#### Scenario: Entropy is part of the replayed input
- **WHEN** the recorded entropy of a log entry after `CreateGame` is altered and the log is replayed
- **THEN** the replayed final RNG state SHALL differ from the original session's RNG state

### Requirement: Replay divergence is reported
If any log entry is rejected during replay, or produces a revision or events different from those recorded, replay SHALL fail with a divergence error. The error SHALL identify the entry's index and the reason, and no partial state SHALL be returned.

#### Scenario: Tampered events
- **WHEN** a log entry's recorded events are altered and the log is replayed
- **THEN** replay SHALL fail with a divergence error naming that entry's index

#### Scenario: Unsupported rules version in log
- **WHEN** a log whose `CreateGame` names a rules version the engine does not support is replayed
- **THEN** replay SHALL fail with a divergence error at index 0 caused by `UNSUPPORTED_RULES_VERSION`
