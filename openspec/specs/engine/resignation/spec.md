# engine/resignation Specification

## Purpose
Defines voluntary permanent elimination during setup or play, preserving the surviving players' progress and declaring the last active participant the winner.

## Requirements

### Requirement: Voluntary resignation
`Resign` SHALL accept only player actors in `setup` or `playing`, with payload `null` and a current revision expectation. It SHALL accept an active participant regardless of whose turn or order roll it is and regardless of the deadline. A malformed payload SHALL reject with `INVALID_PAYLOAD`; an already eliminated participant SHALL reject with `PLAYER_ELIMINATED`. Rejections SHALL preserve state and randomness.

#### Scenario: Resign after deadline
- **WHEN** an active participant resigns at or after the current deadline with a current revision expectation
- **THEN** resignation SHALL be accepted without automatically rolling any dice

#### Scenario: Guard and actor validation
- **WHEN** resignation carries a stale revision, or a system actor, or a non-member player
- **THEN** it SHALL reject with the existing envelope error for the first failed check

#### Scenario: Malformed resignation
- **WHEN** a valid active player submits Resign with a non-null payload
- **THEN** it SHALL reject with INVALID_PAYLOAD and unchanged state and RNG

### Requirement: Permanent elimination
Acceptance SHALL retain the participant in `players`, append their id once to public `eliminated`, remove their position and jail entry, and emit `PlayerResigned { playerId }`. Eliminated players SHALL have no setup membership, turn order entry or owned turn and SHALL be unable to perform further game actions.

#### Scenario: Prisoner resigns
- **WHEN** a participant with an own jail entry resigns
- **THEN** the entry and position SHALL be absent and the id SHALL be recorded as eliminated

#### Scenario: Repeated resignation
- **WHEN** an eliminated participant resigns again in setup or playing with a fresh command id and revision
- **THEN** it SHALL reject with PLAYER_ELIMINATED and no state or RNG changes

### Requirement: Resignation closes an owned turn
In playing, resigning on one's own turn SHALL close it with `TurnEnded` reason `resigned`, cancel all bonus entitlement, and run only the stage 1 no-op settlement. Unless the game ends, the next surviving player in the previous cyclic order SHALL start a regular turn with fresh quotas, a fresh target and deadline `now + 45000`.

#### Scenario: Pending bonus canceled
- **WHEN** the owner resigns after rolling a double while at least two other players remain
- **THEN** events SHALL be PlayerResigned, TurnEnded with reason resigned, then TurnStarted for the next survivor with bonus false

#### Scenario: Unrolled or continued turn
- **WHEN** the owner resigns before rolling or during an automatic-roll continuation
- **THEN** the turn SHALL close without a dice roll or bonus turn

### Requirement: Other player's turn survives
In playing, resignation by a participant other than the turn owner SHALL remove the participant from the order without changing the current turn, its target, deadline, quotas or pending bonus, unless the game ends.

#### Scenario: Remove the next participant
- **WHEN** b resigns during a's turn in order [a, b, c]
- **THEN** the order SHALL be [a, c], a's turn SHALL be unchanged, and normal later advancement SHALL go to c

### Requirement: Setup resignation preserves surviving progress
Setup resignation SHALL remove the participant from every group, pending list and recorded roll, retaining survivor order and rolled values. Empty groups SHALL disappear. A resolved singleton SHALL require no further roll. Completed groups SHALL be ranked by surviving values; unresolved ties SHALL continue from the first unresolved group. If no unresolved group remains, play SHALL begin in the surviving order without extra dice draws.

#### Scenario: Already rolled participant resigns
- **WHEN** a participant with a recorded result resigns while others in that group remain pending
- **THEN** only their result and membership SHALL be removed and the surviving pending roller SHALL continue

#### Scenario: Collapse a tie group
- **WHEN** removal leaves a singleton in the group being rerolled and at least two active participants overall
- **THEN** that group SHALL resolve and the first unresolved group SHALL continue, or play SHALL begin if all groups are resolved

### Requirement: Setup roller replacement
When setup continues with a different current roller, resignation SHALL open a fresh never-reused setupRoll target for that roller with deadline `now + 45000` and emit OrderRollStarted. If the roller remains unchanged, its target and deadline SHALL be preserved.

#### Scenario: Current roller resigns
- **WHEN** the current roller resigns and their group still has pending surviving rollers
- **THEN** the next pending survivor SHALL receive a fresh setupRoll target and full deadline

#### Scenario: Another group disappears
- **WHEN** a resignation removes an earlier singleton group without changing the current roller
- **THEN** group indexing SHALL be corrected while the current target and deadline remain unchanged

### Requirement: Last active player wins
After any accepted resignation leaving exactly one active player, the game SHALL enter finished, set winner to that player, clear setup, turn and order, and emit GameEnded { winner }. There SHALL be no pending deadlines or new turn. Remaining positions and jail entries, if any, SHALL describe only the winner. A setup finish SHALL not create positions or perform order rolls.

#### Scenario: Win in setup
- **WHEN** one of the two remaining active participants resigns during setup
- **THEN** events SHALL be PlayerResigned then GameEnded, with no turn or pending deadline

#### Scenario: Win on owner's turn
- **WHEN** the turn owner resigns leaving one active participant
- **THEN** events SHALL be PlayerResigned, TurnEnded with reason resigned, then GameEnded, with no TurnStarted

#### Scenario: Win on another player's turn
- **WHEN** a non-owner resigns leaving only the owner active
- **THEN** events SHALL be PlayerResigned then GameEnded and the owner's turn SHALL be cleared

### Requirement: Finished games reject further actions
The engine SHALL reject every new player command in finished without mutation or randomness consumption. Existing session command-id deduplication SHALL still return an earlier accepted result for an identical previously accepted command; it SHALL NOT execute it again.

#### Scenario: Commands after victory
- **WHEN** a player submits a new Resign, RollForOrder, RollDice or EndTurn after victory
- **THEN** the command SHALL reject and the finished state SHALL be unchanged

#### Scenario: Stale timeout after removal
- **WHEN** Timeout names a removed setupRoll or turn target, including after victory
- **THEN** it SHALL reject with TARGET_MISMATCH and unchanged state and RNG

### Requirement: Resignation replay and restoration
Given identical ordered commands, contexts and initial state, leave and resignation SHALL produce identical full state and events. Replaying the log or restoring a snapshot plus its tail across resignation and victory SHALL produce the same state and pending deadlines as the live session.

#### Scenario: Restore across resignation
- **WHEN** a snapshot before resignation is restored with a tail containing resignation and game end
- **THEN** full state, RNG, winner, events and pending deadlines SHALL match the live session
