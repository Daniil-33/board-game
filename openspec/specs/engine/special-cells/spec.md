# engine/special-cells Specification

## Purpose
Defines the deterministic landing effects for casino, chance and go-to-jail cells, plus the final jail release and fee rules for `CLASSIC_40`.

## Requirements

### Requirement: Every move dispatches its landing effect
After every player move, including a normal roll and a jail release move, the core SHALL call one `landOn(state, playerId, diceSum)` dispatcher. Asset cells SHALL retain existing purchase and rent behavior. Casino SHALL open a decision; chance SHALL draw a card; go-to-jail SHALL send the player to jail; start and jail cells SHALL have no landing effect. Visiting cell 10 by movement SHALL NOT send the player to jail.

#### Scenario: Cell 10 is visited by movement
- **WHEN** a move ends on jail cell 10 and the player is not already being sent to jail
- **THEN** the player SHALL remain free and no jail-release event SHALL be emitted

### Requirement: Casino decision
Landing on casino SHALL open public `{playerId, turnId, cap}` state and emit `CasinoOffered`. A valid bet SHALL resolve using one RNG draw, emit balance before result, and clear casino. A player may decline; turn closure or timeout auto-declines before settlement. The offer opens even when no legal minimum bet is possible.

#### Scenario: Casino bet wins or loses
- **WHEN** the owner places a valid bet
- **THEN** the accepted transition SHALL consume one deterministic RNG draw, update balance by plus or minus the bet, emit balance before resolution, and clear casino

#### Scenario: Bet while a payment is pending
- **WHEN** the casino owner has an open rent or bank charge and tries to bet
- **THEN** the core SHALL reject with `PAYMENT_PENDING` without changing state or RNG

#### Scenario: Casino guard order and amount bounds
- **WHEN** a `PlaceCasinoBet` command is checked
- **THEN** validation SHALL run payload, auction, actor, deadline, decision (`NO_CASINO`), payment pending, then amount (`INVALID_BET`); a legal amount is a multiple of 10 in `[10, min(cap,cash)]`

#### Scenario: Automatic casino decline
- **WHEN** `EndTurn` or a turn deadline closes an open casino decision
- **THEN** `CasinoDeclined {auto:true}` SHALL occur before any mandatory settlement events

### Requirement: Chance cards
Landing on chance SHALL draw `nextIntInclusive(rng, 0, 3)` and map values in order to `gain-5`, `loss-5`, `gain-10`, `loss-10`. Amount SHALL be computed with integer arithmetic as `Q(startingCapital × p / 100)`. The core SHALL emit `ChanceDrawn {playerId, card, amount}`. Gains SHALL be credited immediately with reason `chance`; losses SHALL open the existing bank charge.

#### Scenario: Negative card opens charge
- **WHEN** the chance draw is `loss-5` or `loss-10`
- **THEN** the matching amount SHALL become an open charge for the landing player

### Requirement: Go-to-jail landing
Landing on cell 30 SHALL emit `SentToJail {playerId, from:30, to:10}` without lap reward, set jail attempts and doubles streak to zero, clear pending bonus, and close the turn with reason `sent-to-jail`. The same behavior SHALL apply when the move landed there on a double.

#### Scenario: Double lands on go-to-jail
- **WHEN** a non-third double move ends on cell 30
- **THEN** the player SHALL be sent to jail, streak and pending bonus SHALL reset, and no bonus turn SHALL be granted

### Requirement: Prisoner turns and jail attempts
A jailed player SHALL continue receiving turns in order. `TurnStarted` SHALL name the prisoner, who chooses whether to pay or attempt a double before rolling. Jail doubles release and move without a bonus or doubles-streak count, leaving `pendingBonus` false. The first two failures keep the player jailed, set `rolled = true`, leave the doubles streak at zero, and allow own-turn actions. A pre-roll timeout performs the jail attempt.

#### Scenario: Prisoner receives their turn
- **WHEN** play advances to a player in jail
- **THEN** `TurnStarted` SHALL name that player, who chooses to pay or roll for a double before the roll

#### Scenario: Jail double does not extend doubles
- **WHEN** a jailed player rolls a double to leave
- **THEN** `pendingBonus` SHALL remain false and `doublesStreak` SHALL remain zero

#### Scenario: Failed jail attempt resets doubles
- **WHEN** a jailed player fails a double attempt
- **THEN** the turn SHALL be rolled, `doublesStreak` SHALL be zero, and `pendingBonus` SHALL be false

### Requirement: Jail fee settlement
The fee SHALL be `Q(lapReward / 4)`. The third failed attempt SHALL settle this bank fee before movement; bankruptcy closes the turn without moving. Voluntary fee payment occurs before a normal roll, debits with reason `jail-fee`, emits `JailReleased {reason:'fee', fee}`, and leaves the turn unrolled.

#### Scenario: Third failure is paid before movement
- **WHEN** a jailed player fails the third roll and can pay or liquidate the fee without bankruptcy
- **THEN** fee settlement and `JailReleased` SHALL precede movement and landing effects

#### Scenario: Third failure bankrupts the player
- **WHEN** the third failed attempt cannot settle the bank fee
- **THEN** the player SHALL be eliminated and the turn SHALL close without a move

#### Scenario: Voluntary fee then normal double
- **WHEN** a jailed player pays before rolling and the next ordinary roll is a double
- **THEN** the turn SHALL use normal doubles behavior and may grant the usual bonus turn

### Requirement: PayJailFee validation order
`PayJailFee` guards SHALL run in this order: payload, auction, actor, deadline, `NOT_IN_JAIL`, `ALREADY_ROLLED`, then `INSUFFICIENT_FUNDS` when cash is below the fee.

#### Scenario: Fee command guard precedence
- **WHEN** multiple `PayJailFee` guards could reject a command
- **THEN** the first failing guard in the listed order SHALL determine the rejection code

### Requirement: Public deterministic events and replay
Casino, chance and final jail events SHALL be public and replayable. Given the same seed, configuration and ordered inputs, the state, event order and RNG state SHALL match exactly.

#### Scenario: Replay includes every special-cell event
- **WHEN** a log contains every newly introduced event type
- **THEN** replay SHALL reproduce the exact final state and ordered event log
