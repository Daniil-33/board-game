# Spec Delta

## MODIFIED Requirements

### Requirement: Invariant enforcement
After every accepted transition, the engine SHALL check the state invariants: revision is a non-negative integer, player ids are unique, the player count matches what the phase allows, the RNG state is well-formed, the phase-specific state is present exactly in its phase (order-roll state only in `setup`; order, current turn and a position for every player only in `playing`; jail entries only for players), and every position is a cell of the 40-cell ring. A violation SHALL be raised as an engine defect, not returned as a rejection, and no state SHALL be returned for it.

#### Scenario: Handler produces an invalid state
- **WHEN** a handler returns a state containing two players with the same id
- **THEN** the engine SHALL raise an invariant-violation error naming the broken invariant

#### Scenario: Valid transition passes silently
- **WHEN** a handler returns a state satisfying all invariants
- **THEN** the engine SHALL return the `AcceptedResult` without error

#### Scenario: Position off the ring
- **WHEN** a handler returns a `playing` state with a player on cell 40
- **THEN** the engine SHALL raise an invariant-violation error naming the ring-position invariant

### Requirement: Target guard
A target guard SHALL name one or more target kinds. A target-guarded command SHALL pass step 2 only if it carries a target expectation equal in kind and id to one of the state's current targets of those kinds, regardless of the state revision. In every other case, including when the state has no current target of those kinds, the engine SHALL reject it with `TARGET_MISMATCH`. The handler SHALL then validate the command against the current state.

#### Scenario: Target command survives unrelated progress
- **WHEN** a target-guarded command names the current target but its author saw an older revision, because other commands were accepted in between
- **THEN** the engine SHALL pass the expectation check and run the type's handler against the current state

#### Scenario: Target no longer current
- **WHEN** a target-guarded command names a target id that differs from the state's current target of that kind
- **THEN** the engine SHALL reject it with `TARGET_MISMATCH` and the input state unchanged

#### Scenario: No current target
- **WHEN** a target-guarded command is executed while the state has no current target of its kind
- **THEN** the engine SHALL reject it with `TARGET_MISMATCH`

#### Scenario: Wrong expectation kind for a target guard
- **WHEN** a command of a target-guarded type carries a revision expectation, even one equal to the current revision
- **THEN** the engine SHALL reject it with `TARGET_MISMATCH`

#### Scenario: Guard over several target kinds
- **WHEN** a command type guarded by kinds `turn` and `setupRoll` names the current `setupRoll` target in phase `setup`, and another names a `turn` target there
- **THEN** the first SHALL pass the expectation check and the second SHALL be rejected with `TARGET_MISMATCH`
