# Spec Delta

## MODIFIED Requirements

### Requirement: Envelope check order
The engine SHALL check a command in a fixed order and SHALL report the first failing check: (1) known type, (2) the command's `expected` satisfies its type's concurrency guard, (3) actor kind allowed for the type, (4) player actor is a member of the game, (5) current phase allowed for the type, (6) the handler's own validation.

#### Scenario: Several checks fail at once
- **WHEN** a command of a revision-guarded type has a stale revision expectation and is issued by an actor kind not allowed for its type
- **THEN** the engine SHALL reject it with `REVISION_MISMATCH`, not `ACTOR_NOT_ALLOWED`

#### Scenario: Stale target reported before actor
- **WHEN** a command of a target-guarded type names a target that is not current and is issued by an actor kind not allowed for its type
- **THEN** the engine SHALL reject it with `TARGET_MISMATCH`, not `ACTOR_NOT_ALLOWED`

#### Scenario: Wrong phase after valid actor
- **WHEN** a command passes the type, expectation and actor checks but the current phase is not allowed for its type
- **THEN** the engine SHALL reject it with `PHASE_NOT_ALLOWED`

## ADDED Requirements

### Requirement: Revision guard
Each command type SHALL declare exactly one concurrency guard: a revision guard or a target guard. A revision-guarded command SHALL be accepted past step 2 only if it carries a revision expectation equal to the current state revision; otherwise the engine SHALL reject it with `REVISION_MISMATCH`. `CreateGame`, `AddPlayer` and `StartGame` SHALL be revision-guarded.

#### Scenario: Wrong expectation kind for a revision guard
- **WHEN** a command of a revision-guarded type carries a target expectation
- **THEN** the engine SHALL reject it with `REVISION_MISMATCH`

#### Scenario: Lifecycle commands are revision-guarded
- **WHEN** `AddPlayer` is executed with a revision expectation one below the current revision
- **THEN** the engine SHALL reject it with `REVISION_MISMATCH`

### Requirement: Target guard
A target guard SHALL name a target kind. A target-guarded command SHALL pass step 2 only if it carries a target expectation of that kind whose id equals the state's current target of that kind, regardless of the state revision. In every other case, including when the state has no current target of that kind, the engine SHALL reject it with `TARGET_MISMATCH`. The handler SHALL then validate the command against the current state.

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

### Requirement: Entropy absorption on acceptance
When a command passes the envelope checks and the state holds an RNG state, the engine SHALL mix the context's entropy into it before the handler runs. Every accepted command's resulting RNG state SHALL reflect that entropy, even if the handler draws nothing. With no RNG state yet (before `CreateGame`), nothing is mixed, so `CreateGame` yields an RNG state derived from the seed alone. A rejection SHALL leave the RNG state unchanged.

#### Scenario: Non-drawing command still absorbs entropy
- **WHEN** the same `AddPlayer` command is executed against the same `lobby` state with two contexts differing only in entropy
- **THEN** both results SHALL be accepted and their RNG states SHALL differ

#### Scenario: CreateGame ignores entropy
- **WHEN** `CreateGame` is executed against the genesis state with the same seed and two different entropies
- **THEN** the resulting RNG states SHALL be deep-equal

#### Scenario: Handler rejection discards the mix
- **WHEN** a handler receives the entropy-mixed state, draws from it, and rejects the command
- **THEN** the returned state SHALL be reference-equal to the input state
