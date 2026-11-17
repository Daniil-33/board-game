# server/test-fixtures Specification

## Purpose
Provide known, invariant-checked game states for browser tests through an explicitly enabled test-only room loader.

## Requirements

### Requirement: Fixture environment guard
Fixture loading SHALL be enabled only when NODE_ENV=test and E2E_FIXTURES=1. Setting E2E_FIXTURES=1 with any other NODE_ENV, including unset, SHALL fail startup naming E2E_FIXTURES before listening. Without opt-in the fixture route SHALL be absent, including in test mode. Production and staging configurations SHALL never enable fixtures.

#### Scenario: Unsafe environment
- **WHEN** E2E_FIXTURES=1 is set with NODE_ENV unset, development, production or staging
- **THEN** startup SHALL fail naming E2E_FIXTURES before accepting connections

#### Scenario: No opt-in
- **WHEN** a server starts without both required environment values
- **THEN** no fixture loading route SHALL be available

#### Scenario: Deployment configurations
- **WHEN** production and staging configuration is inspected
- **THEN** neither SHALL enable E2E_FIXTURES

### Requirement: Named fixture room creation
The test loader SHALL create a new core-7 room from a named fixture and existing guest tokens, validate core invariants, and atomically persist room, membership and full fixture state as its genesis snapshot. Clients SHALL NOT supply arbitrary states. Unknown fixtures, invalid tokens and invalid fixture states SHALL create no room.

#### Scenario: Known fixture
- **WHEN** the enabled loader receives a known fixture and valid distinct guest tokens
- **THEN** a new room SHALL be created whose persisted snapshot and reconnect views match the fixture with those guest identities

#### Scenario: Invalid request or state
- **WHEN** a fixture name is unknown, a token is invalid or duplicated, or the built state violates core invariants
- **THEN** the request SHALL fail without partial persistence

### Requirement: Fixture interface documentation
The server SHALL document the loader request, response, named fixture catalog and builder format for e2e consumers. Test-only builders SHALL be importable by e2e without depending on production startup.

#### Scenario: Browser test setup
- **WHEN** an e2e author follows the server fixture documentation
- **THEN** the author SHALL be able to select a named state, supply logged-in guest tokens, create a room and connect its members through normal Hello frames

### Requirement: Stage 5 fixture catalog
The existing guarded loader SHALL offer named core-helper-built invariant-valid fixtures for a mortgage one lap from expiry, each liquidation tier, bankruptcy to a player creditor, two active players with one about to go bankrupt, and restart with mortgages. Names and usage SHALL be documented for e2e consumers.

#### Scenario: Named scenario creation
- **WHEN** three distinct guests load any stage 5 fixture with both test flags enabled
- **THEN** the room genesis SHALL pass core invariants and normal socket commands SHALL reach the documented scenario

#### Scenario: Terminal scenario with three seats
- **WHEN** the two-active-player fixture is loaded for three guests
- **THEN** one guest SHALL already be eliminated consistently with the core state, all guests SHALL retain membership, and the next bankruptcy SHALL end the game

#### Scenario: Liquidation tiers
- **WHEN** PayRent is sent in each tier fixture
- **THEN** the core SHALL emit the intended liquidation tier steps and all guests SHALL receive equal public events and matching balance projections
