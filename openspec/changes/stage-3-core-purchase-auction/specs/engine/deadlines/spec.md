## MODIFIED Requirements

### Requirement: Player commands strictly before the deadline
A player command bound to a target with a deadline (`RollForOrder`, `RollDice`, `EndTurn`, `BuyAsset`, `StartAuction`, `Bid`, `PassAuction`) SHALL be accepted only when the context time is strictly less than that deadline. At or after it the engine SHALL reject the command with `DEADLINE_PASSED`, leaving the state unchanged; a late player command never triggers a timeout by itself.

#### Scenario: One millisecond before
- **WHEN** the turn owner issues `RollDice` at `deadline - 1`
- **THEN** the engine SHALL accept it

#### Scenario: At the deadline
- **WHEN** the turn owner issues `RollDice` at exactly `deadline`
- **THEN** the engine SHALL reject it with `DEADLINE_PASSED`

### Requirement: Timeout after the roll closes the turn
A `Timeout` on a rolled turn, including a continued one, SHALL open a timeout-origin auction when purchase is pending and defer closure until settlement; otherwise it SHALL run mandatory settlement and close the turn with reason `timeout`, starting the next turn as `EndTurn` would.

#### Scenario: Idle after rolling
- **WHEN** the owner rolled a non-double with no purchase pending and `Timeout` hits the turn
- **THEN** the events SHALL be `TurnEnded { reason: 'timeout' }` followed by `TurnStarted` for the next player

### Requirement: Pending deadlines for the host
The engine SHALL expose a pure function that lists, for any state, every deadline a `Timeout` may resolve as a target and a time. It SHALL list the current setupRoll in setup; in playing it SHALL list only the current auctionResponse during an auction, otherwise the current turn; other phases SHALL list nothing. A paused turn SHALL never be pending. A `Timeout` built from any listed entry at or after its time SHALL pass the target and deadline checks.

#### Scenario: Deadline listed for the current turn
- **WHEN** the pending deadlines of a `playing` state without an auction are requested
- **THEN** the result SHALL be exactly one entry naming the current `turn` target and its deadline

#### Scenario: No deadlines in the lobby
- **WHEN** the pending deadlines of a `lobby` state are requested
- **THEN** the result SHALL be empty

## ADDED Requirements

### Requirement: Paused turn timeout rejection
Timeout naming the paused turn SHALL reject without mutation; only the auctionResponse deadline SHALL be actionable during an auction. Stale and duplicate response targets SHALL not advance twice.

#### Scenario: Old turn timer fires
- **WHEN** an already armed turn timer submits Timeout after an auction has started
- **THEN** the command SHALL reject with no change to auction, turn, balances or RNG

#### Scenario: Automatic roll offers continuation decision
- **WHEN** an unrolled turn Timeout moves onto a free asset
- **THEN** a purchase decision SHALL be available under the same turn's 20000 ms continuation deadline, without opening an auction immediately
