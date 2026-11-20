# Retired interim jail capability

## Purpose
Retires the stage 1 jail capability formerly implemented by `INTERIM_JAIL_RULE` in `interim-jail.ts`. Its release and failed-attempt requirements are superseded by `engine/special-cells`, including the requirement “Prisoner turns and jail attempts”.

## REMOVED Requirements

### Requirement: Release by a double
The former `InterimJailReleased` event and double-release behavior are removed. The final jail release behavior is defined by `engine/special-cells`.

#### Scenario: Double release uses final event
- **WHEN** a jailed player rolls a double
- **THEN** the core SHALL emit `JailReleased`, with no interim event

### Requirement: Failed attempts
The former `InterimJailAttemptFailed` event and automatic release after the third failed roll are removed. The final fee behavior is defined by `engine/special-cells`.

#### Scenario: Third failure uses final fee rule
- **WHEN** a jailed player fails the third attempt
- **THEN** the final bank-fee rule SHALL apply instead of `attempts-exhausted`

### Requirement: Prisoner takes their turn
This interim requirement is removed. Its final turn-order and jail-attempt behavior is specified by `engine/special-cells`, requirement “Prisoner turns and jail attempts”.

#### Scenario: Prisoner turns use final jail rules
- **WHEN** play advances to a jailed player
- **THEN** `TurnStarted` SHALL name that player and the player SHALL choose to pay or attempt a double before rolling, under the final jail rules
