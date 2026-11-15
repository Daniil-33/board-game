# Spec Delta

## Purpose

Defines the temporary stage 1 jail rule without money: how a prisoner tries to leave on their own turns. It is named `INTERIM_JAIL_RULE` in code and protocol and is replaced by the final jail rules in stage 6.

## ADDED Requirements

### Requirement: Prisoner takes their turn
A player in jail SHALL receive their turns in order like any other player. Their `RollDice` (or the automatic roll of a `Timeout` before the roll) SHALL be a release attempt: it draws two dice and emits `DiceRolled`, and it never counts toward consecutive doubles.

#### Scenario: Prisoner is not skipped
- **WHEN** play passes to a player who is in jail
- **THEN** `TurnStarted` SHALL name that player

### Requirement: Release by a double
A double on a release attempt SHALL release the player, emit `InterimJailReleased` with reason `double`, and move the player by the dice sum. It SHALL NOT grant a bonus turn.

#### Scenario: Double releases without bonus
- **WHEN** a prisoner rolls 2 and 2 and then issues `EndTurn`
- **THEN** the player SHALL be out of jail on the jail cell plus 4, and the next turn SHALL belong to the next player in order

### Requirement: Failed attempts
A non-double on the first or second release attempt SHALL emit `InterimJailAttemptFailed` with the attempts used, and the player SHALL stay in jail without moving. A non-double on the third attempt SHALL release the player with reason `attempts-exhausted` and move them by that roll's sum. Attempts count across the prisoner's own turns.

#### Scenario: Third failed attempt
- **WHEN** a prisoner rolls non-doubles on three of their own turns, the third being 5 and 1
- **THEN** the first two SHALL each emit `InterimJailAttemptFailed` without movement, and the third SHALL emit `InterimJailReleased { reason: 'attempts-exhausted' }` and move the player 6 cells from the jail cell
