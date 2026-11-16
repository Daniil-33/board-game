## MODIFIED Requirements

### Requirement: Genesis state
The engine SHALL provide a genesis state with revision 0, phase `uninitialized`, no players, no board, no economy, empty balances, and no RNG state. Every game SHALL begin from this genesis state.

#### Scenario: Genesis state contents
- **WHEN** the genesis state is obtained
- **THEN** its revision SHALL be 0, its phase `uninitialized`, its player list empty, and its RNG state absent, board and economy null, and balances empty

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

### Requirement: Rules version gate
The engine SHALL accept `CreateGame` only for a rules version it explicitly supports. Any other version SHALL be rejected with `UNSUPPORTED_RULES_VERSION`. The engine MUST NOT run a game under a rules version it does not support. This rules version SHALL be `core-4`, and `core-1`, `core-2` and `core-3` SHALL no longer be supported.

#### Scenario: Unknown rules version
- **WHEN** `CreateGame` is issued with a rules version the engine does not list as supported
- **THEN** the engine SHALL reject it with `UNSUPPORTED_RULES_VERSION`

#### Scenario: Previous rules version
- **WHEN** `CreateGame` is issued with `core-1`, `core-2` or `core-3`
- **THEN** the engine SHALL reject it with `UNSUPPORTED_RULES_VERSION`

### Requirement: Start game
`StartGame` SHALL be issued only by the system actor, only in phase `lobby`, and only when the game has at least 2 players. Otherwise it SHALL be rejected with `NOT_ENOUGH_PLAYERS`. On acceptance, the phase SHALL become `setup`, economy SHALL be fixed and every participant credited starting capital, and the first order roll SHALL begin, and the events SHALL be `GameStarted` with the player ids in join order followed by one `BalanceChanged` per player in join order and then `OrderRollStarted`.

#### Scenario: Game started
- **WHEN** the system actor issues `StartGame` in `lobby` with 2 players
- **THEN** the phase SHALL be `setup` and the events SHALL be `GameStarted` listing both player ids in join order, then a starting-capital `BalanceChanged` for each player in join order, then `OrderRollStarted` for the first player

#### Scenario: Too few players
- **WHEN** `StartGame` is issued in `lobby` with 1 player
- **THEN** the engine SHALL reject it with `NOT_ENOUGH_PLAYERS`
