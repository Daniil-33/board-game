## MODIFIED Requirements

### Requirement: Doubles grant a bonus turn
A double outside jail that is not the third consecutive one SHALL mark a bonus turn as pending. When the turn closes, by `EndTurn` or by `Timeout`, the same player SHALL start a new turn with a fresh deadline and fresh build and offer quotas, and `TurnStarted` SHALL carry `bonus: true`. The count of consecutive doubles carries into the bonus turn and resets when a non-double is rolled or play passes to another player.

#### Scenario: Manual double
- **WHEN** a rolls 3 and 3 and then issues `EndTurn`
- **THEN** the next turn SHALL belong to a with `bonus: true`, a new turn id and a deadline 45 000 ms after the `EndTurn` time

#### Scenario: Automatic double
- **WHEN** a `Timeout` before the roll rolls a double for a, and later a `Timeout` closes that continued turn
- **THEN** the turn that starts next SHALL belong to a with `bonus: true`

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
