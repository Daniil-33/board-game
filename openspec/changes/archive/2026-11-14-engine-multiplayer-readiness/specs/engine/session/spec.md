# Spec Delta

## MODIFIED Requirements

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
