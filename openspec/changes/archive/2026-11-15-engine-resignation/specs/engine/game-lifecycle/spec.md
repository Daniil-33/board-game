# Spec Delta

## ADDED Requirements

### Requirement: Leave a lobby
LeaveLobby SHALL be revision-guarded, system-only and lobby-only, with payload { playerId: non-empty string }. Acceptance SHALL remove that member from players while preserving survivor join order and emit PlayerLeftLobby { playerId }. Missing members SHALL reject with PLAYER_NOT_FOUND; malformed payloads SHALL reject with INVALID_PAYLOAD. Creator authority and room closure SHALL remain host responsibilities.

#### Scenario: Participant leaves
- **WHEN** the system removes b from lobby players [a, b, c]
- **THEN** players SHALL be [a, c] and the only event SHALL be PlayerLeftLobby { playerId: b }

#### Scenario: Empty lobby
- **WHEN** the system removes the last lobby member
- **THEN** the phase SHALL remain lobby with no players and no winner

#### Scenario: Missing participant
- **WHEN** LeaveLobby names an absent participant with a valid revision
- **THEN** it SHALL reject with PLAYER_NOT_FOUND without state or RNG changes

#### Scenario: Leave authorization and concurrency
- **WHEN** LeaveLobby carries a stale revision or is submitted by a player actor
- **THEN** it SHALL reject with the existing first envelope error

#### Scenario: Cannot leave after start
- **WHEN** the system submits LeaveLobby during setup or playing with a current revision
- **THEN** it SHALL reject with PHASE_NOT_ALLOWED

#### Scenario: Start after departure
- **WHEN** StartGame is submitted after departure leaves fewer than two participants
- **THEN** it SHALL reject with NOT_ENOUGH_PLAYERS

## MODIFIED Requirements

### Requirement: Game phases
The game state SHALL be in exactly one phase: `uninitialized`, `lobby`, `setup`, `playing` or `finished`.

#### Scenario: Detailed Game phases contract
- **WHEN** this requirement is exercised
- **THEN** the following constraints SHALL hold:

The game state SHALL be in exactly one phase: `uninitialized`, `lobby`, `setup`, `playing` or `finished`. The only transitions SHALL be `uninitialized` to `lobby` (by `CreateGame`), `lobby` to `setup` (by `StartGame`), `setup` to `playing` (by the order roll that fixes the turn order), and `setup` or `playing` to `finished` (by resignation leaving one active participant). Phase `setup` SHALL accept only `RollForOrder`, `Timeout` and `Resign`; phase `playing` SHALL accept only `RollDice`, `EndTurn`, `Timeout` and `Resign`.

#### Scenario: Command in setup phase
- **WHEN** any lifecycle command is executed while the game is in phase `setup`
- **THEN** the engine SHALL reject it with `PHASE_NOT_ALLOWED`

#### Scenario: Turn command in setup phase
- **WHEN** `RollDice` is executed while the game is in phase `setup`
- **THEN** the engine SHALL reject it without changing the state

#### Scenario: Finished phase is terminal
- **WHEN** a new command is submitted in finished
- **THEN** it SHALL reject without mutation, with the existing envelope check order preserved

### Requirement: Rules version gate
The engine SHALL accept `CreateGame` only for a rules version it explicitly supports. Any other version SHALL be rejected with `UNSUPPORTED_RULES_VERSION`. The engine MUST NOT run a game under a rules version it does not support. This rules version SHALL be `core-3`, and `core-1` and `core-2` SHALL no longer be supported.

#### Scenario: Unknown rules version
- **WHEN** `CreateGame` is issued with a rules version the engine does not list as supported
- **THEN** the engine SHALL reject it with `UNSUPPORTED_RULES_VERSION`

#### Scenario: Previous rules version
- **WHEN** `CreateGame` is issued with `core-1` or `core-2`
- **THEN** the engine SHALL reject it with `UNSUPPORTED_RULES_VERSION`
