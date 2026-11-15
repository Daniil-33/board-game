# Spec Delta

## ADDED Requirements

### Requirement: Restore from snapshot and tail
The engine SHALL rebuild a session from a state snapshot and the log entries accepted after it, re-executing each entry with its recorded time and entropy. The tail SHALL start at the snapshot revision plus one. The restored session SHALL hold the same state as the original and deduplicate the command ids in the tail.

#### Scenario: Restore matches the live session
- **WHEN** a session plays setup and several turns, a snapshot is taken at some revision, and the session is restored from that snapshot plus the later entries
- **THEN** the restored state SHALL be deep-equal to the live state, and submitting the same further commands to both SHALL give deep-equal results

#### Scenario: Empty tail
- **WHEN** a session is restored from a snapshot with no tail
- **THEN** its state SHALL be deep-equal to the snapshot

### Requirement: Restore divergence is reported
Restoring SHALL fail with the replay divergence error, naming the tail index and reason, when a tail entry is rejected, produces a revision or events different from those recorded, or does not follow the previous revision. No partial session SHALL be returned.

#### Scenario: Tail does not follow the snapshot
- **WHEN** the first tail entry's revision is not the snapshot revision plus one
- **THEN** restoring SHALL fail with a divergence error at index 0

#### Scenario: Tampered tail entry
- **WHEN** a tail entry's recorded events or entropy are altered
- **THEN** restoring SHALL fail with a divergence error naming that entry's index
