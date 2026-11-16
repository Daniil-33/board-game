## MODIFIED Requirements

### Requirement: Permanent elimination
Acceptance SHALL retain the participant in `players`, append their id once to public `eliminated`, remove their position and jail entry, and emit `PlayerResigned { playerId }`. Eliminated players SHALL have no setup membership or turn order entry and SHALL be unable to perform further game actions. An eliminated player SHALL own a turn only temporarily while that turn is paused and an auction is present, pending resigned closure at auction resolution.

#### Scenario: Prisoner resigns
- **WHEN** a participant with an own jail entry resigns
- **THEN** the entry and position SHALL be absent and the id SHALL be recorded as eliminated

#### Scenario: Repeated resignation
- **WHEN** an eliminated participant resigns again in setup or playing with a fresh command id and revision
- **THEN** it SHALL reject with PLAYER_ELIMINATED and no state or RNG changes

### Requirement: Resignation closes an owned turn
In playing, resigning on one's own turn SHALL drop any purchase decision and close it with `TurnEnded` reason `resigned`, cancel all bonus entitlement, and run mandatory settlement. During a running auction this closure SHALL be deferred until resolution or voiding; the paused turn SHALL retain the eliminated owner, with no bonus entitlement. Unless the game ends, the next surviving player in the previous cyclic order SHALL start a regular turn with fresh quotas, a fresh target and deadline `now + 45000`.

#### Scenario: Pending bonus canceled
- **WHEN** the owner resigns after rolling a double while at least two other players remain
- **THEN** events SHALL be PlayerResigned, TurnEnded with reason resigned, then TurnStarted for the next survivor with bonus false

#### Scenario: Unrolled or continued turn
- **WHEN** the owner resigns before rolling or during an automatic-roll continuation
- **THEN** the turn SHALL close without a dice roll or bonus turn

### Requirement: Other player's turn survives
In playing, resignation by a participant other than the turn owner SHALL remove the participant from the order without changing the current turn, its target, deadline, quotas or pending bonus, unless the game ends or auction departure requires advancing, resolving or voiding the auction. Auction completion SHALL apply its ordinary resume or close behavior unless the owner has resigned.

#### Scenario: Remove the next participant
- **WHEN** b resigns during a's turn in order [a, b, c]
- **THEN** the order SHALL be [a, c], a's turn SHALL be unchanged, and normal later advancement SHALL go to c

### Requirement: Last active player wins
After any accepted resignation leaving exactly one active player, the game SHALL enter finished, set winner to that player, clear setup, turn, order, purchase and auction, and emit GameEnded { winner }. There SHALL be no pending deadlines or new turn. Remaining positions and jail entries, if any, SHALL describe only the winner. A setup finish SHALL not create positions or perform order rolls.

#### Scenario: Win in setup
- **WHEN** one of the two remaining active participants resigns during setup
- **THEN** events SHALL be PlayerResigned then GameEnded, with no turn or pending deadline

#### Scenario: Win on owner's turn
- **WHEN** the turn owner resigns leaving one active participant
- **THEN** events SHALL be PlayerResigned, TurnEnded with reason resigned, then GameEnded, with no TurnStarted

#### Scenario: Win on another player's turn
- **WHEN** a non-owner resigns leaving only the owner active
- **THEN** events SHALL be PlayerResigned then GameEnded and the owner's turn SHALL be cleared

## ADDED Requirements

### Requirement: Provisional auction resignation policy
Resigning non-leaders SHALL count as passed and no longer respond; a resigning leader SHALL void the auction without sale. A resigning decision holder SHALL drop the decision without auction. A resigning auction turn owner SHALL defer resigned closure while any auction remains. Auction completion SHALL choose the next surviving player in pre-resignation cyclic order and cancel bonus entitlement.

#### Scenario: Non-leader responder resigns
- **WHEN** the current responder resigns without ending the game
- **THEN** they SHALL count as passed and the auction SHALL advance or resolve

#### Scenario: Another non-leader resigns
- **WHEN** an eligible player other than responder or leader resigns
- **THEN** they SHALL count as passed and the current response target and deadline SHALL survive unless settlement is now due

#### Scenario: Leader resigns
- **WHEN** the leader resigns without ending the game
- **THEN** no payment SHALL occur and the asset SHALL remain free; the turn SHALL resume or close according to its origin or deferred resignation

#### Scenario: Decision holder resigns
- **WHEN** the purchase decision holder resigns
- **THEN** the decision SHALL disappear and no auction SHALL start

#### Scenario: Turn owner resigns during auction
- **WHEN** the non-leading turn owner resigns with at least two survivors
- **THEN** the auction SHALL continue among survivors and its paused turn SHALL temporarily retain the eliminated owner, then close as resigned with the next cyclic survivor and no bonus

#### Scenario: Successor also resigns
- **WHEN** the original successor resigns before the deferred auction resolves
- **THEN** closure SHALL select the next remaining survivor after the eliminated owner in the retained cyclic auction order

#### Scenario: Immediate victory overrides auction
- **WHEN** a resignation during a decision or auction leaves one active player
- **THEN** the game SHALL finish immediately, clear decision and auction, and leave no pending deadlines
