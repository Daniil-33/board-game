# Spec Delta

## MODIFIED Requirements

### Requirement: Game phases
The game state SHALL be in exactly one phase: `uninitialized`, `lobby`, `setup` or `playing`. The only transitions SHALL be `uninitialized` to `lobby` (by `CreateGame`), `lobby` to `setup` (by `StartGame`), and `setup` to `playing` (by the order roll that fixes the turn order). Phase `setup` SHALL accept only `RollForOrder` and `Timeout`; phase `playing` SHALL accept only `RollDice`, `EndTurn` and `Timeout`.

#### Scenario: Command in setup phase
- **WHEN** any lifecycle command is executed while the game is in phase `setup`
- **THEN** the engine SHALL reject it with `PHASE_NOT_ALLOWED`

#### Scenario: Turn command in setup phase
- **WHEN** `RollDice` is executed while the game is in phase `setup`
- **THEN** the engine SHALL reject it without changing the state

### Requirement: Start game
`StartGame` SHALL be issued only by the system actor, only in phase `lobby`, and only when the game has at least 2 players. Otherwise it SHALL be rejected with `NOT_ENOUGH_PLAYERS`. On acceptance, the phase SHALL become `setup`, the first order roll SHALL begin, and the events SHALL be `GameStarted` with the player ids in join order followed by `OrderRollStarted`.

#### Scenario: Game started
- **WHEN** the system actor issues `StartGame` in `lobby` with 2 players
- **THEN** the phase SHALL be `setup` and the events SHALL be `GameStarted` listing both player ids in join order, then `OrderRollStarted` for the first player

#### Scenario: Too few players
- **WHEN** `StartGame` is issued in `lobby` with 1 player
- **THEN** the engine SHALL reject it with `NOT_ENOUGH_PLAYERS`

### Requirement: Rules version gate
The engine SHALL accept `CreateGame` only for a rules version it explicitly supports. Any other version SHALL be rejected with `UNSUPPORTED_RULES_VERSION`. The engine MUST NOT run a game under a rules version it does not support. This rules version SHALL be `core-2`, and `core-1` SHALL no longer be supported.

#### Scenario: Unknown rules version
- **WHEN** `CreateGame` is issued with a rules version the engine does not list as supported
- **THEN** the engine SHALL reject it with `UNSUPPORTED_RULES_VERSION`

#### Scenario: Previous rules version
- **WHEN** `CreateGame` is issued with `core-1`
- **THEN** the engine SHALL reject it with `UNSUPPORTED_RULES_VERSION`
