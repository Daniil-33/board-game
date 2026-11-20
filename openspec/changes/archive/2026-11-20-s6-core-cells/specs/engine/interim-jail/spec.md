# Retired jail capability

## Purpose
Removes the stage 1 temporary jail behavior, which is replaced by final stage 6 jail rules.

## REMOVED Requirements

### Requirement: Release by a double
The interim event names and release rule are removed; the final jail release behavior is defined by `engine/special-cells`.

#### Scenario: Double release uses final event
- **WHEN** a jailed player rolls a double
- **THEN** the core SHALL emit `JailReleased`, with no interim event

### Requirement: Failed attempts
The interim automatic release after the third failed roll is removed. The final fee behavior is defined by `engine/special-cells`.

#### Scenario: Third failure uses final fee rule
- **WHEN** a jailed player fails the third attempt
- **THEN** the final bank-fee rule SHALL apply instead of `attempts-exhausted`

### Requirement: Prisoner takes their turn
**Reason**: Superseded by `engine/special-cells`, requirement “Prisoner turns and jail attempts”.
**Migration**: Use the final prisoner-turn and jail-attempt rules in `engine/special-cells`; this interim requirement is retired.

#### Scenario: Prisoner turns use final jail rules
- **WHEN** play advances to a jailed player
- **THEN** `TurnStarted` SHALL name that player and the player SHALL choose to pay or attempt a double before rolling, under the final jail rules
