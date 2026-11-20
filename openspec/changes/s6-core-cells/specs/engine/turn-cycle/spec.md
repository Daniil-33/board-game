# engine/turn-cycle Specification

## MODIFIED Requirements

### Requirement: Roll the dice once per turn
An accepted `RollDice` by a free player SHALL draw two values from 1 to 6, emit `DiceRolled` with both dice, the double flag and `auto: false`, and mark the turn rolled. A prisoner still receives their turn in order, and `TurnStarted` names them; they choose to pay or attempt a double before rolling. A second `RollDice` in the same turn SHALL be rejected with `ALREADY_ROLLED`.

#### Scenario: Second roll rejected
- **WHEN** the turn owner issues `RollDice` after already rolling in this turn
- **THEN** the engine SHALL reject it with `ALREADY_ROLLED`

### Requirement: Movement on CLASSIC_40
After a move, `landOn(state, playerId, diceSum)` SHALL dispatch the landing effect, whether the move followed an ordinary roll, jail release, or voluntary or forced fee release. The player SHALL move forward by the dice sum modulo 40 and `PlayerMoved` SHALL report the start cell, end cell and steps. The ring SHALL be the exported CLASSIC_40 layout. A forward crossing or exact landing on cell 0 SHALL credit economy.lapReward once immediately after `PlayerMoved` and before the landing effect. Asset cells SHALL retain purchase or rent behavior; casino, chance and go-to-jail SHALL use their special-cell behavior. Start and jail cells SHALL be inert; cell 10 reached by movement is a visit.

#### Scenario: Wrap around the ring
- **WHEN** a player on cell 36 rolls 3 and 4
- **THEN** the player SHALL be on cell 3 and `PlayerMoved` SHALL report from 36, to 3, steps 7, followed by one lap-reward BalanceChanged event

