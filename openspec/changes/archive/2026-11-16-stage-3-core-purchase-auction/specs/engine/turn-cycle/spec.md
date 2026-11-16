## MODIFIED Requirements

### Requirement: Movement on CLASSIC_40
After a roll that does not send the player to jail, the player SHALL move forward by the dice sum modulo 40 and `PlayerMoved` SHALL report the start cell, end cell and steps. The ring SHALL be the exported CLASSIC_40 layout. A forward crossing or exact landing on cell 0 SHALL credit economy.lapReward once immediately after PlayerMoved and before any landing settlement; landing on a free asset SHALL then offer purchase, while owned assets SHALL have no effect.

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

## ADDED Requirements

### Requirement: Auction pauses the turn
An auction SHALL set pausedRemainingMs to max(0, deadline - now) and emit TurnPaused. RollDice, EndTurn, BuyAsset and StartAuction SHALL reject during the auction. After choice settlement the same turn SHALL resume at now + pausedRemainingMs, clear the pause and emit TurnResumed. End-turn or timeout settlement SHALL close through normal bonus rules; deferred resignation SHALL override both and cancel bonus.

#### Scenario: Time arithmetic
- **WHEN** an auction starts with 12345 ms left and resolves at time T by choice
- **THEN** the same turn SHALL resume with deadline T + 12345 and unchanged quotas

#### Scenario: End-turn double
- **WHEN** a double's owner ends a turn with a pending purchase and the resulting auction settles
- **THEN** closure SHALL start the bonus turn with fresh time and quotas
