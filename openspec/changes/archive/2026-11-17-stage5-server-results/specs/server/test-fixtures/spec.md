# Spec Delta

## MODIFIED Requirements

### Requirement: Named fixture room creation
The test loader SHALL create a new core-7 room from a named fixture and existing guest tokens, validate core invariants, and atomically persist room, membership and full fixture state as its genesis snapshot. Clients SHALL NOT supply arbitrary states. Unknown fixtures, invalid tokens and invalid fixture states SHALL create no room.

#### Scenario: Known fixture
- **WHEN** the enabled loader receives a known fixture and valid distinct guest tokens
- **THEN** a new room SHALL be created whose persisted snapshot and reconnect views match the fixture with those guest identities

#### Scenario: Invalid request or state
- **WHEN** a fixture name is unknown, a token is invalid or duplicated, or the built state violates core invariants
- **THEN** the request SHALL fail without partial persistence

## ADDED Requirements

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
