# engine/interim-jail Specification

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
