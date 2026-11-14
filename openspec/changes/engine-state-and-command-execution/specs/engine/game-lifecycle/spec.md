# Spec Delta

## Purpose

Defines the versioned game state skeleton and the lifecycle commands that take a game from nothing to started: creating it with a seed and rules version, adding players, and starting it.

## ADDED Requirements

### Requirement: Genesis state
The engine SHALL provide a genesis state with revision 0, phase `uninitialized`, no players, and no RNG state. Every game SHALL begin from this genesis state.

#### Scenario: Genesis state contents
- **WHEN** the genesis state is obtained
- **THEN** its revision SHALL be 0, its phase `uninitialized`, its player list empty, and its RNG state absent

### Requirement: Game phases
The game state SHALL be in exactly one phase. In this capability the phases are `uninitialized`, `lobby` and `setup`. The only transitions SHALL be `uninitialized` to `lobby` (by `CreateGame`) and `lobby` to `setup` (by `StartGame`). No command type SHALL be accepted in `setup` yet.

#### Scenario: Command in setup phase
- **WHEN** any lifecycle command is executed while the game is in phase `setup`
- **THEN** the engine SHALL reject it with `PHASE_NOT_ALLOWED`

### Requirement: Create game
`CreateGame` SHALL be issued only by the system actor, only in phase `uninitialized`. Its payload SHALL carry a `seed` and a `rulesVersion`. On acceptance, the state SHALL move to `lobby`, record the rules version, initialize the RNG state from the seed, and emit `GameCreated`.

#### Scenario: Game created
- **WHEN** the system actor issues `CreateGame` with a valid seed and a supported rules version against the genesis state
- **THEN** the result SHALL be accepted at revision 1, the phase SHALL be `lobby`, and the events SHALL be exactly one `GameCreated` carrying the rules version and the context time

#### Scenario: Second CreateGame
- **WHEN** `CreateGame` is issued while the game is in `lobby`
- **THEN** the engine SHALL reject it with `PHASE_NOT_ALLOWED`

#### Scenario: Same seed, same RNG state
- **WHEN** two games are created with the same seed and rules version
- **THEN** their resulting RNG states SHALL be deep-equal

### Requirement: Seed validation
A `CreateGame` seed SHALL be an integer from 0 to 2^32 − 1 inclusive. Any other value SHALL be rejected with `INVALID_SEED`.

#### Scenario: Fractional seed
- **WHEN** `CreateGame` is issued with seed `1.5`
- **THEN** the engine SHALL reject it with `INVALID_SEED`

#### Scenario: Seed out of range
- **WHEN** `CreateGame` is issued with seed `2^32`
- **THEN** the engine SHALL reject it with `INVALID_SEED`

### Requirement: Rules version gate
The engine SHALL accept `CreateGame` only for a rules version it explicitly supports. Any other version SHALL be rejected with `UNSUPPORTED_RULES_VERSION`. The engine MUST NOT run a game under a rules version it does not support.

#### Scenario: Unknown rules version
- **WHEN** `CreateGame` is issued with a rules version the engine does not list as supported
- **THEN** the engine SHALL reject it with `UNSUPPORTED_RULES_VERSION`

### Requirement: Add player
`AddPlayer` SHALL be issued only by the system actor, only in phase `lobby`. Its payload SHALL carry a `playerId`. On acceptance, the player SHALL be appended to the player list in join order and `PlayerAdded` SHALL be emitted.

#### Scenario: Player added
- **WHEN** the system actor issues `AddPlayer` for a new player id in `lobby`
- **THEN** the player SHALL appear last in the player list and the events SHALL be exactly one `PlayerAdded` carrying that id

#### Scenario: Player cannot add themselves
- **WHEN** a player actor issues `AddPlayer`
- **THEN** the engine SHALL reject it with `ACTOR_NOT_ALLOWED`

### Requirement: Player list limits
A game SHALL hold at most 6 players with unique ids. Adding an id already present SHALL be rejected with `DUPLICATE_PLAYER`. Adding a seventh player SHALL be rejected with `PLAYER_LIMIT_REACHED`.

#### Scenario: Duplicate player id
- **WHEN** `AddPlayer` is issued for an id already in the game
- **THEN** the engine SHALL reject it with `DUPLICATE_PLAYER`

#### Scenario: Seventh player
- **WHEN** `AddPlayer` is issued while the game already has 6 players
- **THEN** the engine SHALL reject it with `PLAYER_LIMIT_REACHED`

### Requirement: Start game
`StartGame` SHALL be issued only by the system actor, only in phase `lobby`, and only when the game has at least 2 players. Otherwise it SHALL be rejected with `NOT_ENOUGH_PLAYERS`. On acceptance, the phase SHALL become `setup` and `GameStarted` SHALL be emitted with the player ids in join order.

#### Scenario: Game started
- **WHEN** the system actor issues `StartGame` in `lobby` with 2 players
- **THEN** the phase SHALL be `setup` and the events SHALL be exactly one `GameStarted` listing both player ids in join order

#### Scenario: Too few players
- **WHEN** `StartGame` is issued in `lobby` with 1 player
- **THEN** the engine SHALL reject it with `NOT_ENOUGH_PLAYERS`
