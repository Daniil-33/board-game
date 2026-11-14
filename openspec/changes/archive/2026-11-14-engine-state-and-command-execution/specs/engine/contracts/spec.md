# Spec Delta

## MODIFIED Requirements

### Requirement: Deterministic transition context
The engine SHALL require callers to supply wall-clock time explicitly via `TransitionContext`. Randomness SHALL come only from RNG state held inside the game state, seeded by an explicit input. The engine MUST NOT access `Math.random()`, `Date.now()`, or any global entropy source internally. The context MUST NOT carry a random source.

#### Scenario: RNG injected externally
- **WHEN** a transition is called twice with the same state (whose RNG state derives from an externally supplied seed), the same command, and the same `TransitionContext`
- **THEN** both calls SHALL produce deep-equal `TransitionResult` values, including the resulting RNG state

#### Scenario: Rejected command does not consume randomness
- **WHEN** a transition draws random values while handling a command and then rejects it
- **THEN** the returned state, including its RNG state, SHALL be reference-equal to the input state

#### Scenario: No global random access
- **WHEN** `packages/game-core` is imported in a strict boundary test
- **THEN** it SHALL contain zero references to `Math.random`, `Date.now`, or `new Date()`

### Requirement: Command idempotency envelope
Every `GameCommand` SHALL carry a `commandId`, an `actor`, an `expectedRevision`, and a `type`. The `actor` SHALL be either a player actor carrying a `PlayerId` or the system actor carrying no player identity. The engine SHALL reject commands whose `expectedRevision` does not match the current state revision, returning a typed `REVISION_MISMATCH` error without mutating state.

#### Scenario: Stale command rejected
- **WHEN** a command's `expectedRevision` is less than the current state revision
- **THEN** the transition SHALL return a `RejectedResult` with code `REVISION_MISMATCH`

#### Scenario: Future revision rejected
- **WHEN** a command's `expectedRevision` is greater than the current state revision
- **THEN** the transition SHALL return a `RejectedResult` with code `REVISION_MISMATCH`

#### Scenario: System actor needs no player identity
- **WHEN** a command is issued by the system actor
- **THEN** the envelope SHALL be valid without any `PlayerId`

#### Scenario: Plain PlayerId is not an actor
- **WHEN** code assigns a bare `PlayerId` where a command `actor` is expected
- **THEN** TypeScript SHALL reject the assignment at compile time

## ADDED Requirements

### Requirement: Timestamp representation
`Timestamp` SHALL be a branded non-negative integer number of milliseconds since the Unix epoch, so that timestamps can be compared and offset with integer arithmetic.

#### Scenario: Timestamps compare numerically
- **WHEN** two timestamps `a` and `b` are supplied with `a` earlier than `b`
- **THEN** `a < b` SHALL hold

#### Scenario: Plain number is not a Timestamp
- **WHEN** a function expecting `Timestamp` receives a plain `number`
- **THEN** TypeScript SHALL reject the assignment at compile time
