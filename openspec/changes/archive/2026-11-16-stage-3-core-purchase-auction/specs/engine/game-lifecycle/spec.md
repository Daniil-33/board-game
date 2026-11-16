## MODIFIED Requirements

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

### Requirement: Rules version gate
The engine SHALL accept `CreateGame` only for a rules version it explicitly supports. Any other version SHALL be rejected with `UNSUPPORTED_RULES_VERSION`. The engine MUST NOT run a game under a rules version it does not support. This rules version SHALL be `core-5`, and `core-1`, `core-2`, `core-3` and `core-4` SHALL no longer be supported.

#### Scenario: Unknown rules version
- **WHEN** `CreateGame` is issued with a rules version the engine does not list as supported
- **THEN** the engine SHALL reject it with `UNSUPPORTED_RULES_VERSION`

#### Scenario: Previous rules version
- **WHEN** `CreateGame` is issued with `core-1`, `core-2`, `core-3` or `core-4`
- **THEN** the engine SHALL reject it with `UNSUPPORTED_RULES_VERSION`
