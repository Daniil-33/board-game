# server/test-entropy Specification

## Purpose
Allow repeatable browser evidence for rare dice sequences through explicitly selected deterministic test context without weakening production randomness.

## Requirements

### Requirement: Guarded deterministic context
The server SHALL enable deterministic game seed and transition entropy only through an explicit test environment variable with NODE_ENV=test. Any explicit setting outside test mode SHALL refuse startup before listening. The production Compose definition SHALL never set this variable.

#### Scenario: Unsafe configuration
- **WHEN** the test variable is set with NODE_ENV unset or different from test
- **THEN** startup fails without accepting connections

#### Scenario: Reproducible dice
- **WHEN** a fresh test stack receives the same configured seed and ordered game inputs
- **THEN** it produces the same setup and dice outcomes, including a reproducible third consecutive double reaching jail

### Requirement: Production entropy default
Without explicit test configuration the server SHALL use CSPRNG game seeds and transition entropy, including when NODE_ENV=test.

#### Scenario: No opt-in
- **WHEN** the server starts without the explicit test variable
- **THEN** deterministic entropy is disabled
