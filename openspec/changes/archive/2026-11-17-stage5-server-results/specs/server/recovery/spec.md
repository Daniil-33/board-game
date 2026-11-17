# Spec Delta

## ADDED Requirements

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
