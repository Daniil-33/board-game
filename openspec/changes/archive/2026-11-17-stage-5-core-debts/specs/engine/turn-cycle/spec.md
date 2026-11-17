## MODIFIED Requirements

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

