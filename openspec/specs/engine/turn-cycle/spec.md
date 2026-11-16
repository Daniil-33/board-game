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

### Requirement: Movement on CLASSIC_40
After a roll that does not send the player to jail, the player SHALL move forward by the dice sum modulo 40 and `PlayerMoved` SHALL report the start cell, end cell and steps. The ring SHALL be the exported CLASSIC_40 layout. A forward crossing or exact landing on cell 0 SHALL credit economy.lapReward once immediately after PlayerMoved and before any landing settlement; landing on a free asset SHALL then offer purchase, while owned assets SHALL follow the rent landing rules.

#### Scenario: Wrap around the ring
- **WHEN** a player on cell 36 rolls 3 and 4
- **THEN** the player SHALL be on cell 3 and `PlayerMoved` SHALL report from 36, to 3, steps 7, followed by one lap-reward BalanceChanged event

### Requirement: Ending a turn
`EndTurn` SHALL be accepted only after the turn's roll; before it the engine SHALL reject it with `ROLL_REQUIRED`. With a pending purchase, EndTurn SHALL instead open an auction with reason end-turn and defer closure until settlement. Closing a turn SHALL clear the purchase, run mandatory settlement, emit `TurnEnded` with a reason, and start the next turn: a bonus turn for the same player if one is pending, otherwise a turn for the next player in order, wrapping around.

#### Scenario: End turn passes play
- **WHEN** a, first of order [a, b], rolls a non-double, has no purchase pending and issues `EndTurn`
- **THEN** the events SHALL end with `TurnEnded { reason: 'end-turn' }` and `TurnStarted` for b with `bonus: false`

#### Scenario: End turn before rolling
- **WHEN** the turn owner issues `EndTurn` without having rolled
- **THEN** the engine SHALL reject it with `ROLL_REQUIRED`

### Requirement: Doubles grant a bonus turn
A double outside jail that is not the third consecutive one SHALL mark a bonus turn as pending. When the turn closes, by `EndTurn` or by `Timeout`, the same player SHALL start a new turn with a fresh deadline and fresh build and offer quotas, and `TurnStarted` SHALL carry `bonus: true`. The count of consecutive doubles carries into the bonus turn and resets when a non-double is rolled or play passes to another player.

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
Every new turn, bonus turns included, SHALL start with one build and two trade offers remaining. A continuation SHALL preserve both quotas. Building SHALL consume one build; selling SHALL not restore it.

#### Scenario: Fresh quotas on a bonus turn
- **WHEN** a bonus turn starts
- **THEN** its build quota SHALL be one and its offer quota SHALL be two, whatever the closing turn had left

#### Scenario: Used quota on a bonus turn
- **WHEN** a player builds, rolls a double and closes the turn
- **THEN** the bonus turn SHALL have one build and two offers remaining, and a legal build in it SHALL be accepted

#### Scenario: Selling does not replenish
- **WHEN** a player builds and then sells a house in the same turn
- **THEN** the build quota SHALL remain zero

#### Scenario: New full turn
- **WHEN** play returns to the player after another player has taken a turn
- **THEN** one build SHALL be available again

### Requirement: Auction pauses the turn
An auction SHALL set pausedRemainingMs to max(0, deadline - now) and emit TurnPaused. RollDice, EndTurn, BuyAsset and StartAuction SHALL reject during the auction. After choice settlement the same turn SHALL resume at now + pausedRemainingMs, clear the pause and emit TurnResumed. End-turn or timeout settlement SHALL close through normal bonus rules; deferred resignation SHALL override both and cancel bonus.

#### Scenario: Time arithmetic
- **WHEN** an auction starts with 12345 ms left and resolves at time T by choice
- **THEN** the same turn SHALL resume with deadline T + 12345 and unchanged quotas

#### Scenario: End-turn double
- **WHEN** a double's owner ends a turn with a pending purchase and the resulting auction settles
- **THEN** closure SHALL start the bonus turn with fresh time, a fresh build quota and fresh offers
