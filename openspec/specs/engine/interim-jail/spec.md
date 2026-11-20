# engine/interim-jail Specification

## Purpose
Defines the temporary stage 1 jail rule without money: how a prisoner tries to leave on their own turns. It is named `INTERIM_JAIL_RULE` in code and protocol and is replaced by the final jail rules in stage 6.

## Requirements

### Requirement: Prisoner takes their turn
A player in jail SHALL receive their turns in order like any other player. Their `RollDice` (or the automatic roll of a `Timeout` before the roll) SHALL be a release attempt: it draws two dice and emits `DiceRolled`, and it never counts toward consecutive doubles.

#### Scenario: Prisoner is not skipped
- **WHEN** play passes to a player who is in jail
- **THEN** `TurnStarted` SHALL name that player
