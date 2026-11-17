## MODIFIED Requirements

### Requirement: Ending a turn
`EndTurn` SHALL be accepted only after the turn's roll; before it the engine SHALL reject it with `ROLL_REQUIRED`. With a pending purchase, EndTurn SHALL instead open an auction with reason end-turn and defer closure until settlement. Closing a turn SHALL clear the purchase, run mandatory settlement, emit `TurnEnded` with a reason, and start the next turn: a bonus turn for the same player if one is pending, otherwise a turn for the next player in order, wrapping around. Bankruptcy during mandatory settlement SHALL instead close once with reason bankrupt, cancel bonus entitlement, and pass to the successor in the old order or finish immediately without lap processing when one active player remains.

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

