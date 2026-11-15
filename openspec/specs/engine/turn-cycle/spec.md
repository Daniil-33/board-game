# engine/turn-cycle Specification

## Purpose
Defines the turn cycle of phase `playing`: whose turn it is, rolling 2d6, moving around the ring, closing turns, doubles and bonus turns, the third-double jail send, and per-turn quotas.

## Requirements

### Requirement: Current turn
In phase `playing` there SHALL always be exactly one current turn, identified by a `turn` target whose id is never reused in the game, owned by one player, with a deadline 45 000 ms after the `now` of the command that started it. Starting a turn SHALL emit `TurnStarted` with the turn id, player, deadline and whether it is a bonus turn.

#### Scenario: Turn ids are never reused
- **WHEN** a seeded game plays 200 turns
- **THEN** every `TurnStarted` event SHALL carry a distinct turn id

### Requirement: Only the turn owner acts
`RollDice` and `EndTurn` SHALL be issued by player actors naming the current `turn` target. A member who does not own the current turn SHALL be rejected with `NOT_ACTIVE_PLAYER`.

#### Scenario: Other player rolls
- **WHEN** b issues `RollDice` for the current turn owned by a
- **THEN** the engine SHALL reject it with `NOT_ACTIVE_PLAYER` and the state unchanged

### Requirement: Roll the dice once per turn
An accepted `RollDice` by a player not in jail SHALL draw two values from 1 to 6, emit `DiceRolled` with both dice, the double flag and `auto: false`, and mark the turn rolled. A second `RollDice` in the same turn SHALL be rejected with `ALREADY_ROLLED`.

#### Scenario: Second roll rejected
- **WHEN** the turn owner issues `RollDice` after already rolling in this turn
- **THEN** the engine SHALL reject it with `ALREADY_ROLLED`

### Requirement: Movement on the placeholder ring
After a roll that does not send the player to jail, the player SHALL move forward by the dice sum modulo 40 and `PlayerMoved` SHALL report the start cell, end cell and steps. The ring SHALL be the exported 40-cell placeholder layout, marked as replaced in stage 2, with cell 0 the start and one jail cell.

#### Scenario: Wrap around the ring
- **WHEN** a player on cell 36 rolls 3 and 4
- **THEN** the player SHALL be on cell 3 and `PlayerMoved` SHALL report from 36, to 3, steps 7

### Requirement: Ending a turn
`EndTurn` SHALL be accepted only after the turn's roll; before it the engine SHALL reject it with `ROLL_REQUIRED`. Closing a turn SHALL run the mandatory-settlement step (no effect in stage 1), emit `TurnEnded` with a reason, and start the next turn: a bonus turn for the same player if one is pending, otherwise a turn for the next player in order, wrapping around.

#### Scenario: End turn passes play
- **WHEN** a, first of order [a, b], rolls a non-double and issues `EndTurn`
- **THEN** the events SHALL end with `TurnEnded { reason: 'end-turn' }` and `TurnStarted` for b with `bonus: false`

#### Scenario: End turn before rolling
- **WHEN** the turn owner issues `EndTurn` without having rolled
- **THEN** the engine SHALL reject it with `ROLL_REQUIRED`

### Requirement: Doubles grant a bonus turn
A double outside jail that is not the third consecutive one SHALL mark a bonus turn as pending. When the turn closes, by `EndTurn` or by `Timeout`, the same player SHALL start a new turn with a fresh deadline and fresh quotas, and `TurnStarted` SHALL carry `bonus: true`. The count of consecutive doubles carries into the bonus turn and resets when a non-double is rolled or play passes to another player.

#### Scenario: Manual double
- **WHEN** a rolls 3 and 3 and then issues `EndTurn`
- **THEN** the next turn SHALL belong to a with `bonus: true`, a new turn id and a deadline 45 000 ms after the `EndTurn` time

#### Scenario: Automatic double
- **WHEN** a `Timeout` before the roll rolls a double for a, and later a `Timeout` closes that continued turn
- **THEN** the turn that starts next SHALL belong to a with `bonus: true`

### Requirement: Third consecutive double sends to jail
A third consecutive double SHALL, before any movement, put the player on the jail cell, emit `SentToJail`, reset the count of consecutive doubles, cancel any pending bonus, and end the turn at once with reason `sent-to-jail`; the next player in order then starts a turn. This applies to manual and automatic rolls.

#### Scenario: Three doubles in a row
- **WHEN** a rolls a double, ends the turn, rolls a double in the bonus turn, ends it, and rolls a third double
- **THEN** the third roll's events SHALL be `DiceRolled`, `SentToJail`, `TurnEnded { reason: 'sent-to-jail' }` and `TurnStarted` for the next player, with no `PlayerMoved`, and a SHALL be on the jail cell and in jail

### Requirement: Turn quotas
Every new turn, including a bonus turn, SHALL start with quotas of one build and two trade offers remaining. A continuation of the same turn SHALL keep the turn's quotas. No stage 1 command consumes a quota.

#### Scenario: Fresh quotas on a bonus turn
- **WHEN** a bonus turn starts
- **THEN** its quotas SHALL be one build and two offers remaining
