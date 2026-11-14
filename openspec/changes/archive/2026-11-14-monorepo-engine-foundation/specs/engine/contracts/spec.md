# Spec Delta

## Purpose

Defines the domain-neutral contracts that every future game-mechanic package must implement: branded identity types, deterministic transition interface, monetary quantization, and idempotent command protocol. This capability is the technical prerequisite for all gameplay features.

## ADDED Requirements

### Requirement: Branded primitive types
The engine SHALL expose branded types `Money`, `PlayerId`, `AssetId`, `CommandId`, `Revision`, and `Timestamp` that are structurally incompatible with plain primitives to prevent accidental misuse at compile time.

#### Scenario: Type safety at compile time
- **WHEN** a function that expects `Money` receives a plain `number`
- **THEN** TypeScript SHALL reject the assignment at compile time

### Requirement: Deterministic transition context
The engine SHALL require callers to supply randomness and wall-clock time explicitly via `TransitionContext`; the engine MUST NOT access `Math.random()`, `Date.now()`, or any global entropy source internally.

#### Scenario: RNG injected externally
- **WHEN** a transition function is called with a `TransitionContext` whose `rng.next()` returns a fixed sequence
- **THEN** every call with the same state, command, and context SHALL produce the identical `TransitionResult`

#### Scenario: No global random access
- **WHEN** `packages/engine` is imported in a strict boundary test
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
Every `GameCommand` SHALL carry a `commandId`, `actorId`, `expectedRevision`, and `type`; the engine SHALL reject commands whose `expectedRevision` does not match the current state revision, returning a typed `REVISION_MISMATCH` error without mutating state.

#### Scenario: Stale command rejected
- **WHEN** a command's `expectedRevision` is less than the current state revision
- **THEN** the transition SHALL return a `RejectedResult` with code `REVISION_MISMATCH`

#### Scenario: Future revision rejected
- **WHEN** a command's `expectedRevision` is greater than the current state revision
- **THEN** the transition SHALL return a `RejectedResult` with code `REVISION_MISMATCH`

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
