# engine/contracts Specification

## Purpose

Defines the domain-neutral contracts that every future game-mechanic package must implement: branded identity types, deterministic transition interface, monetary quantization, and idempotent command protocol. This capability is the technical prerequisite for all gameplay features.

## Requirements

### Requirement: Branded primitive types
The engine SHALL expose branded types `Money`, `PlayerId`, `AssetId`, `CommandId`, `Revision`, and `Timestamp` that are structurally incompatible with plain primitives to prevent accidental misuse at compile time.

#### Scenario: Type safety at compile time
- **WHEN** a function that expects `Money` receives a plain `number`
- **THEN** TypeScript SHALL reject the assignment at compile time

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

### Requirement: Transition result protocol
Every transition SHALL return either an `AcceptedResult` (new state + events, revision incremented by 1) or a `RejectedResult` (unchanged state, empty events array, error code). A rejected transition MUST NOT mutate state or advance the revision.

#### Scenario: Accepted transition increments revision
- **WHEN** a transition accepts a command at revision N
- **THEN** the returned state's revision SHALL be N + 1

#### Scenario: Rejected transition leaves state unchanged
- **WHEN** a transition rejects a command
- **THEN** the returned state SHALL be reference-equal to the input state and the revision SHALL be unchanged

#### Scenario: Rejected transition returns empty events
- **WHEN** a transition rejects a command
- **THEN** `result.events` SHALL be an empty readonly array

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

### Requirement: Monetary quantization
The engine SHALL expose a pure function `Q(x: number): Money` that implements `10 × floor(x / 10)` using integer arithmetic, returning a `Money`-branded value. All monetary amounts produced by game logic MUST pass through `Q` exactly once at the boundary of each operation.

#### Scenario: Q rounds down to nearest 10
- **WHEN** `Q(1259)` is called
- **THEN** it SHALL return `1250` as `Money`

#### Scenario: Q on exact multiple
- **WHEN** `Q(1260)` is called
- **THEN** it SHALL return `1260` as `Money`

#### Scenario: Q(0) is zero
- **WHEN** `Q(0)` is called
- **THEN** it SHALL return `0` as `Money`

#### Scenario: No floating point in monetary result
- **WHEN** `Q` is applied to any integer input
- **THEN** the result SHALL be an integer with no fractional component

### Requirement: Timestamp representation
`Timestamp` SHALL be a branded non-negative integer number of milliseconds since the Unix epoch, so that timestamps can be compared and offset with integer arithmetic.

#### Scenario: Timestamps compare numerically
- **WHEN** two timestamps `a` and `b` are supplied with `a` earlier than `b`
- **THEN** `a < b` SHALL hold

#### Scenario: Plain number is not a Timestamp
- **WHEN** a function expecting `Timestamp` receives a plain `number`
- **THEN** TypeScript SHALL reject the assignment at compile time
