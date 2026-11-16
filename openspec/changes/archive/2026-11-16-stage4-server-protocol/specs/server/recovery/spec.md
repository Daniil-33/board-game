# Spec Delta

## ADDED Requirements

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
