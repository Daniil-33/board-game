# Spec Delta

## MODIFIED Requirements

### Requirement: Deterministic transition context
The engine SHALL require callers to supply wall-clock time and entropy explicitly via `TransitionContext`. The entropy SHALL be 128 bits supplied by the host for every command. Randomness SHALL come only from RNG state held inside the game state, seeded by an explicit input and mixed with the entropy of each accepted command. The engine MUST NOT access `Math.random()`, `Date.now()`, or any global entropy source internally.

#### Scenario: RNG injected externally
- **WHEN** a transition is called twice with the same state (whose RNG state derives from an externally supplied seed), the same command, and the same `TransitionContext`
- **THEN** both calls SHALL produce deep-equal `TransitionResult` values, including the resulting RNG state

#### Scenario: Rejected command does not consume randomness
- **WHEN** a transition draws random values while handling a command and then rejects it
- **THEN** the returned state, including its RNG state, SHALL be reference-equal to the input state

#### Scenario: Future draws depend on future entropy
- **WHEN** the same command drawing random values is executed against the same state with two contexts that differ only in entropy
- **THEN** the drawn values or the resulting RNG states SHALL differ

#### Scenario: Malformed entropy rejected at construction
- **WHEN** code constructs entropy from anything other than four integers in [0, 2^32 − 1]
- **THEN** construction SHALL throw a range error, and a plain number array SHALL NOT type-check as entropy

#### Scenario: No global random access
- **WHEN** `packages/game-core` is imported in a strict boundary test
- **THEN** it SHALL contain zero references to `Math.random`, `Date.now`, or `new Date()`

### Requirement: Command idempotency envelope
Every `GameCommand` SHALL carry a `commandId`, an `actor`, an `expected` concurrency expectation, and a `type`. The `actor` SHALL be either a player actor carrying a `PlayerId` or the system actor carrying no player identity. The `expected` SHALL be either a revision expectation carrying a `Revision`, or a target expectation carrying a target kind and a target id. How the engine checks `expected` is defined by the command type's concurrency guard.

#### Scenario: Stale command rejected
- **WHEN** a command of a revision-guarded type carries a revision expectation less than the current state revision
- **THEN** the transition SHALL return a `RejectedResult` with code `REVISION_MISMATCH`

#### Scenario: Future revision rejected
- **WHEN** a command of a revision-guarded type carries a revision expectation greater than the current state revision
- **THEN** the transition SHALL return a `RejectedResult` with code `REVISION_MISMATCH`

#### Scenario: System actor needs no player identity
- **WHEN** a command is issued by the system actor
- **THEN** the envelope SHALL be valid without any `PlayerId`

#### Scenario: Plain PlayerId is not an actor
- **WHEN** code assigns a bare `PlayerId` where a command `actor` is expected
- **THEN** TypeScript SHALL reject the assignment at compile time

#### Scenario: Plain revision is not an expectation
- **WHEN** code assigns a bare `Revision` where a command's `expected` is required
- **THEN** TypeScript SHALL reject the assignment at compile time
