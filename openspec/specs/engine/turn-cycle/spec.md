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
An accepted `RollDice` by a free player SHALL draw two values from 1 to 6, emit `DiceRolled` with both dice, the double flag and `auto: false`, and mark the turn rolled. A prisoner still receives their turn in order, and `TurnStarted` names them; they choose to pay or attempt a double before rolling. A second `RollDice` in the same turn SHALL be rejected with `ALREADY_ROLLED`.

#### Scenario: Second roll rejected
- **WHEN** the turn owner issues `RollDice` after already rolling in this turn
- **THEN** the engine SHALL reject it with `ALREADY_ROLLED`

### Requirement: Movement on CLASSIC_40
After each move, including jail release, the core SHALL dispatch the landing effect. The player SHALL move forward by dice sum modulo 40; `PlayerMoved` SHALL report from, to and steps on `CLASSIC_40`. A forward crossing or exact landing on cell 0 SHALL credit `lapReward` once after movement and before landing. Asset cells SHALL keep purchase/rent behavior; casino, chance and go-to-jail SHALL use their effects. Start and jail SHALL be inert; reaching cell 10 by movement is a visit.

#### Scenario: Wrap around the ring
- **WHEN** a player on cell 36 rolls 3 and 4
- **THEN** the player SHALL be on cell 3 and `PlayerMoved` SHALL report from 36, to 3, steps 7, followed by one lap-reward BalanceChanged event

### Requirement: Ending a turn
`EndTurn` SHALL require a roll (`ROLL_REQUIRED` otherwise). A pending purchase SHALL open an end-turn auction and defer closure. Closure SHALL clear purchase, settle mandatory debt, emit `TurnEnded` with a reason, then start a pending bonus or the cyclic successor. Bankruptcy SHALL override the reason to bankrupt, cancel bonus and close once; play SHALL pass using old order or finish immediately with one survivor, without lap processing.

#### Scenario: End turn passes play
- **WHEN** a, first of order [a, b], rolls a non-double, has no purchase pending and issues `EndTurn`
- **THEN** the events SHALL end with `TurnEnded { reason: 'end-turn' }` and `TurnStarted` for b with `bonus: false`

#### Scenario: End turn before rolling
- **WHEN** the turn owner issues `EndTurn` without having rolled
- **THEN** the engine SHALL reject it with `ROLL_REQUIRED`

#### Scenario: Bankruptcy overrides a bonus
- **WHEN** mandatory payment bankrupts a payer with a pending bonus
- **THEN** exactly one TurnEnded with reason bankrupt SHALL occur and the next survivor SHALL start a regular turn unless the game finishes

#### Scenario: Terminal bankruptcy skips boundary
- **WHEN** mandatory payment eliminates the second-to-last player
- **THEN** TurnEnded reason bankrupt SHALL precede GameEnded, with no mortgage lap processing or TurnStarted

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
