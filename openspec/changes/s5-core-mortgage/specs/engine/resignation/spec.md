## MODIFIED Requirements

### Requirement: Permanent elimination
Acceptance SHALL retain the participant in `players`, append their id once to public `eliminated`, remove their position and jail entry, and emit `PlayerResigned { playerId }`. It SHALL append eliminations {playerId, reason: 'resigned', at: context.now, creditorId: null} in eliminated order, remove the player from mortgage pending and invoke the no-op cancelOffersOf hook. Eliminated players SHALL have no setup membership or turn order entry and SHALL be unable to perform further game actions. An eliminated player SHALL own a turn only temporarily while that turn is paused and an auction is present, pending resigned closure at auction resolution.

#### Scenario: Prisoner resigns
- **WHEN** a participant with an own jail entry resigns
- **THEN** the entry and position SHALL be absent and the id SHALL be recorded as eliminated

#### Scenario: Repeated resignation
- **WHEN** an eliminated participant resigns again in setup or playing with a fresh command id and revision
- **THEN** it SHALL reject with PLAYER_ELIMINATED and no state or RNG changes

### Requirement: Resignation closes an owned turn
In playing, resigning on one's own turn SHALL drop any purchase decision and close it with `TurnEnded` reason `resigned`, cancel all bonus entitlement, and run mandatory settlement. During a running auction this closure SHALL be deferred until resolution; the paused turn SHALL retain the eliminated owner, with no bonus entitlement. Unless the game ends, the next surviving player in the previous cyclic order SHALL start a regular turn with fresh quotas, a fresh target and deadline `now + 45000`.

#### Scenario: Pending bonus canceled
- **WHEN** the owner resigns after rolling a double while at least two other players remain
- **THEN** events SHALL include PlayerResigned, TurnEnded with reason resigned, then TurnStarted for the next survivor with bonus false

#### Scenario: Unrolled or continued turn
- **WHEN** the owner resigns before rolling or during an automatic-roll continuation
- **THEN** the turn SHALL close without a dice roll or bonus turn

### Requirement: Last active player wins
After any accepted resignation leaving exactly one active player, the game SHALL enter finished, set winner to that player, clear setup, turn, order, purchase and auction, set finishedAt to context.now, and emit GameEnded { winner, at, eliminations, finalBalances }, including every player balance. Terminal elimination SHALL skip lap processing. There SHALL be no pending deadlines or new turn. Remaining positions and jail entries, if any, SHALL describe only the winner. A setup finish SHALL not create positions or perform order rolls.

#### Scenario: Win in setup
- **WHEN** one of the two remaining active participants resigns during setup
- **THEN** events SHALL include PlayerResigned then GameEnded, with no turn or pending deadline

#### Scenario: Win on owner's turn
- **WHEN** the turn owner resigns leaving one active participant
- **THEN** events SHALL include PlayerResigned, TurnEnded with reason resigned, then GameEnded, with no TurnStarted

#### Scenario: Win on another player's turn
- **WHEN** a non-owner resigns leaving only the owner active
- **THEN** events SHALL include PlayerResigned then GameEnded and the owner's turn SHALL be cleared

## ADDED Requirements

### Requirement: Resignation releases assets
Resignation SHALL delete all the resigner's owners, houses and mortgages and emit AssetsReleased {playerId, assetIds, reason: 'resigned'} in board order. It SHALL leave their balance unchanged. R1/R2 SHALL continue dropping rent without payment when the payer or owner resigns. No eliminated player SHALL own assets, houses or mortgages.

#### Scenario: Release a portfolio
- **WHEN** a player resigns with houses and mortgaged assets
- **THEN** their portfolio SHALL become free with no refund or advance repayment and unrelated rent SHALL survive unless the game finishes

### Requirement: Elimination and finish validity
eliminations SHALL match eliminated in ids and order, recording reason, at and creditorId. finishedAt SHALL be non-null exactly in finished and SHALL use trusted transition time. Initial eliminations SHALL be empty and finishedAt SHALL be null.

#### Scenario: Recorded outcome
- **WHEN** resignation leaves one active player
- **THEN** its elimination timestamp and finish timestamp SHALL equal context.now, and final balances SHALL include eliminated players
