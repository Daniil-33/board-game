# Spec Delta

## MODIFIED Requirements

### Requirement: Invariant enforcement
After every accepted transition, the engine SHALL check state invariants. Violations SHALL raise an engine defect, return no state and never become command rejections.

#### Scenario: Detailed Invariant enforcement contract
- **WHEN** this requirement is exercised
- **THEN** the following constraints SHALL hold:

After every accepted transition, the engine SHALL check the state invariants: revision is a non-negative integer, player ids are unique, the player count matches what the phase allows, the RNG state is well-formed, the phase-specific state is present exactly in its phase (order-roll state only in `setup`; order, current turn and a position for every active player in `playing`; no eliminated positions or jail entries; finished has no setup, order or turn), and every position is a cell of the 40-cell ring. A violation SHALL be raised as an engine defect, not returned as a rejection, and no state SHALL be returned for it.

#### Scenario: Handler produces an invalid state
- **WHEN** a handler returns a state containing two players with the same id
- **THEN** the engine SHALL raise an invariant-violation error naming the broken invariant

#### Scenario: Valid transition passes silently
- **WHEN** a handler returns a state satisfying all invariants
- **THEN** the engine SHALL return the `AcceptedResult` without error

#### Scenario: Position off the ring
- **WHEN** a handler returns a `playing` state with a player on cell 40
- **THEN** the engine SHALL raise an invariant-violation error naming the ring-position invariant

#### Scenario: Eliminated participant still has a position
- **WHEN** a handler returns a playing state with a position for an eliminated participant
- **THEN** the engine SHALL raise an invariant-violation error

## ADDED Requirements

### Requirement: Active membership invariants
Eliminated ids SHALL be unique members of players; active ids SHALL be players minus eliminated. Setup groups SHALL partition active ids; pending and recorded rolls SHALL name only members of the current group. Playing order SHALL be a permutation of active ids and the turn owner SHALL be active. Setup and playing SHALL have at least two active participants.

#### Scenario: Eliminated participant in order
- **WHEN** a handler returns an order containing an eliminated participant
- **THEN** the engine SHALL raise an invariant-violation error

### Requirement: Winner invariants
Winner SHALL be null outside finished. Finished SHALL have exactly one active participant equal to winner, no setup, order or turn, and no pending deadlines. Positions and jail records in finished SHALL contain only the winner if present. Lobby and uninitialized SHALL have empty eliminated lists, positions and jail records.

#### Scenario: Invalid winner
- **WHEN** a handler returns finished with winner eliminated or with two active participants
- **THEN** the engine SHALL raise an invariant-violation error
