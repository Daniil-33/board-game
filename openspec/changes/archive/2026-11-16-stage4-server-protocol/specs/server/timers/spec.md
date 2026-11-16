# Spec Delta

## ADDED Requirements

### Requirement: Rent uses the turn deadline
An open rent settlement SHALL keep the existing turn deadline active without a separate settlement timer. At that deadline the normal system Timeout SHALL persist the core's automatic payment and turn closure before broadcasting.

#### Scenario: Rent deadline
- **WHEN** the fake clock reaches the turn deadline with rent open
- **THEN** exactly one Timeout SHALL settle rent automatically, publish the resulting balances and close the turn

#### Scenario: Overdue rent at boot
- **WHEN** boot restores a room with rent open and an overdue turn deadline
- **THEN** automatic payment SHALL persist without further clock advance and timers SHALL follow the resulting core state
