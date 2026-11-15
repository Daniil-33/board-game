# Spec Delta

## Purpose

Defines the setup phase that decides the turn order: one die per participant, descending order, rerolls only among tied participants, a deadline on every roll, and the switch to play once the order is fixed.

## ADDED Requirements

### Requirement: Sequential order rolls
In phase `setup` exactly one participant SHALL be the current roller, identified by a `setupRoll` target whose id is never reused in the game. `StartGame` SHALL make the first player in join order the current roller. Only the current roller may issue `RollForOrder`; any other member is rejected with `NOT_ACTIVE_PLAYER`.

#### Scenario: First roller after start
- **WHEN** `StartGame` is accepted with players a, b, c joined in that order
- **THEN** the current roller SHALL be a, with a new `setupRoll` target, and an `OrderRollStarted` event SHALL name a, the target id and the deadline

#### Scenario: Out-of-turn order roll
- **WHEN** b issues `RollForOrder` naming the current `setupRoll` target while a is the current roller
- **THEN** the engine SHALL reject it with `NOT_ACTIVE_PLAYER` and the state unchanged

### Requirement: One die per order roll
An accepted `RollForOrder` SHALL draw one value from 1 to 6 from the game RNG, record it for the roller and emit `OrderDieRolled` with the player, the value and `auto: false`. The next participant still to roll in the current group SHALL become the current roller with a new `setupRoll` target.

#### Scenario: Roll recorded and next roller
- **WHEN** a, the current roller of the first round, rolls 4
- **THEN** the events SHALL start with `OrderDieRolled { playerId: a, value: 4, auto: false }` and b SHALL be the current roller under a target id different from a's

### Requirement: Descending order with tie groups
When every member of the group being rolled has rolled, the group SHALL be split by value in descending order. Groups of one are resolved. A group of several equal values SHALL emit `OrderTied` and be rerolled by its members only, keeping their relative join order. Rerolls SHALL resolve the first unresolved group in order before any later one.

#### Scenario: Tie among two of three
- **WHEN** a, b, c roll 5, 2, 5
- **THEN** `OrderTied` SHALL name a and c, the next roller SHALL be a, then c, and b SHALL keep the last place without rolling again

#### Scenario: First unresolved group first
- **WHEN** a, b, c, d roll 6, 6, 3, 3
- **THEN** a and b SHALL reroll before c and d reroll

#### Scenario: Repeated tie
- **WHEN** two tied players roll equal values again
- **THEN** another `OrderTied` SHALL name them and they SHALL reroll again

### Requirement: Order fixed and play begins
When no unresolved group remains, the same accepted command SHALL emit `TurnOrderDetermined` with the order, set phase `playing`, place every player on the start cell, and start the first turn for the first player in the order.

#### Scenario: Two players, no tie
- **WHEN** a rolls 2 and b rolls 5
- **THEN** the events SHALL end with `TurnOrderDetermined { order: [b, a] }` and `TurnStarted` for b, the phase SHALL be `playing`, and both players SHALL be on cell 0

### Requirement: Order roll deadline
Every order roll SHALL have a deadline 45 000 ms after the `now` of the command that made it current. `RollForOrder` SHALL be accepted only strictly before it. A `Timeout` naming the current `setupRoll` target at or after it SHALL roll for the current roller exactly as `RollForOrder` would, with `auto: true`.

#### Scenario: Timeout rolls for the participant
- **WHEN** the system issues `Timeout` for the current `setupRoll` target of a at its deadline
- **THEN** the events SHALL start with `OrderDieRolled { playerId: a, auto: true }` and setup SHALL continue as after a manual roll
