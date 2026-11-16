# engine/game-lifecycle Specification

## Purpose

Defines the versioned game state skeleton and the lifecycle commands that take a game from nothing to started: creating it with a seed and rules version, adding players, and starting it.

## Requirements

### Requirement: Genesis state
The engine SHALL provide a genesis state with revision 0, phase `uninitialized`, no players, no board, no economy, empty balances, and no RNG state, empty owners, null purchase and null auction. Every game SHALL begin from this genesis state.

#### Scenario: Genesis state contents
- **WHEN** the genesis state is obtained
- **THEN** its revision SHALL be 0, its phase `uninitialized`, its player list empty, and its RNG state absent, board and economy null, and balances and owners empty, purchase and auction null

### Requirement: Game phases
The game state SHALL be in exactly one phase: `uninitialized`, `lobby`, `setup`, `playing` or `finished`.

#### Scenario: Detailed Game phases contract
- **WHEN** this requirement is exercised
- **THEN** the following constraints SHALL hold:

The game state SHALL be in exactly one phase: `uninitialized`, `lobby`, `setup`, `playing` or `finished`. The only transitions SHALL be `uninitialized` to `lobby` (by `CreateGame`), `lobby` to `setup` (by `StartGame`), `setup` to `playing` (by the order roll that fixes the turn order), and `setup` or `playing` to `finished` (by resignation leaving one active participant). Phase `setup` SHALL accept only `RollForOrder`, `Timeout` and `Resign`; phase `playing` SHALL accept only `RollDice`, `EndTurn`, `BuyAsset`, `StartAuction`, `Bid`, `PassAuction`, `Timeout` and `Resign`.

#### Scenario: Command in setup phase
- **WHEN** any lifecycle command is executed while the game is in phase `setup`
- **THEN** the engine SHALL reject it with `PHASE_NOT_ALLOWED`

#### Scenario: Turn command in setup phase
- **WHEN** `RollDice` is executed while the game is in phase `setup`
- **THEN** the engine SHALL reject it without changing the state

#### Scenario: Finished phase is terminal
- **WHEN** a new command is submitted in finished
- **THEN** it SHALL reject without mutation, with the existing envelope check order preserved

### Requirement: Create game
`CreateGame` SHALL be issued only by the system actor, only in phase `uninitialized`. Its payload SHALL carry a `seed` and a `rulesVersion`. On acceptance, the state SHALL move to `lobby`, record the rules version, initialize the RNG state from the seed, absorb creation context entropy, generate and store the board under gen-1, and emit `GameCreated` then `BoardGenerated`.

#### Scenario: Game created
- **WHEN** the system actor issues `CreateGame` with a valid seed and a supported rules version against the genesis state
- **THEN** the result SHALL be accepted at revision 1, the phase SHALL be `lobby`, and the events SHALL be `GameCreated` carrying the rules version and the context time, then `BoardGenerated` carrying board version metadata

#### Scenario: Second CreateGame
- **WHEN** `CreateGame` is issued while the game is in `lobby`
- **THEN** the engine SHALL reject it with `PHASE_NOT_ALLOWED`

#### Scenario: Same seed, same RNG state
- **WHEN** two games are created with the same seed, rules version and context entropy
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
The engine SHALL accept `CreateGame` only for a rules version it explicitly supports. Any other version SHALL be rejected with `UNSUPPORTED_RULES_VERSION`. The engine MUST NOT run a game under a rules version it does not support. This rules version SHALL be `core-5`, and `core-1`, `core-2`, `core-3` and `core-4` SHALL no longer be supported.

#### Scenario: Unknown rules version
- **WHEN** `CreateGame` is issued with a rules version the engine does not list as supported
- **THEN** the engine SHALL reject it with `UNSUPPORTED_RULES_VERSION`

#### Scenario: Previous rules version
- **WHEN** `CreateGame` is issued with `core-1`, `core-2`, `core-3` or `core-4`
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
`StartGame` SHALL be issued only by the system actor, only in phase `lobby`, and only when the game has at least 2 players. Otherwise it SHALL be rejected with `NOT_ENOUGH_PLAYERS`. On acceptance, the phase SHALL become `setup`, economy SHALL be fixed and every participant credited starting capital, and the first order roll SHALL begin, and the events SHALL be `GameStarted` with the player ids in join order followed by one `BalanceChanged` per player in join order and then `OrderRollStarted`.

#### Scenario: Game started
- **WHEN** the system actor issues `StartGame` in `lobby` with 2 players
- **THEN** the phase SHALL be `setup` and the events SHALL be `GameStarted` listing both player ids in join order, then a starting-capital `BalanceChanged` for each player in join order, then `OrderRollStarted` for the first player

#### Scenario: Too few players
- **WHEN** `StartGame` is issued in `lobby` with 1 player
- **THEN** the engine SHALL reject it with `NOT_ENOUGH_PLAYERS`

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
