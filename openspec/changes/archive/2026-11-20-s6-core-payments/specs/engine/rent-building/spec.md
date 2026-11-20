# Spec Delta

## ADDED Requirements

### Requirement: Mandatory bank charge
The state SHALL hold either an open rent settlement or a bank charge, never both. A bank charge SHALL identify its payer, integer-quanta amount and cause. The core SHALL expose a pure charge-opening helper and emit ChargeDue when a valid charge opens.

#### Scenario: Charge opens
- **WHEN** the current turn owner incurs a valid bank charge and no mandatory payment is open
- **THEN** the charge SHALL be stored and ChargeDue SHALL carry its payer, amount and cause

#### Scenario: Payment slots are exclusive
- **WHEN** a transition attempts to hold both rent and a bank charge
- **THEN** the state invariant SHALL reject the state

### Requirement: PayCharge command
PayCharge SHALL require null payload, a turn target, the turn owner, an unexpired turn and an open charge, using the same guard order and codes as PayRent except that no open charge SHALL return NO_CHARGE. Successful payment SHALL use shared debt settlement, debit the payer without crediting a player, clear the charge and emit ChargePaid {payerId, amount, auto: false}. Bankruptcy SHALL close the payer's turn as PayRent does.

#### Scenario: Explicit charge payment
- **WHEN** the turn owner submits PayCharge with null payload while a charge is open and the turn is unexpired
- **THEN** the charge SHALL be settled atomically and ChargePaid SHALL have auto false

#### Scenario: No charge
- **WHEN** PayCharge is submitted with no open charge
- **THEN** it SHALL reject with NO_CHARGE and leave state and RNG unchanged

#### Scenario: Bank charge bankruptcy
- **WHEN** PayCharge cannot be covered by the payer's full liquidation value
- **THEN** the bank-creditor bankruptcy payout SHALL run and the turn SHALL close with the bankruptcy outcome

### Requirement: Mandatory charge turn closure
Every turn closure SHALL settle an open charge through shared debt settlement, including at EndTurn and the turn deadline. A solvent payer SHALL emit ChargePaid with auto true; liquidation and bankruptcy SHALL emit their existing settlement events. An open charge SHALL not carry into the next turn.

#### Scenario: EndTurn auto payment
- **WHEN** the turn owner closes a turn with an open charge and sufficient cash
- **THEN** the charge SHALL be paid with ChargePaid auto true before the turn closes

#### Scenario: Deadline auto payment
- **WHEN** the turn deadline closes a turn with an open charge and sufficient cash
- **THEN** the charge SHALL be paid with ChargePaid auto true before the turn closes

### Requirement: Charge payment guards
While a charge is open, building and redemption SHALL fail with PAYMENT_PENDING. Mortgage and house sale SHALL remain allowed. Existing rent guards and their RENT_PENDING code SHALL remain unchanged.

#### Scenario: Asset actions during charge
- **WHEN** the payer attempts build, redeem, mortgage or house sale during an open charge
- **THEN** build and redeem SHALL return PAYMENT_PENDING, while mortgage and house sale SHALL remain legal when their other conditions pass

## MODIFIED Requirements

### Requirement: State validity and replay
Newly created games SHALL support only core-8. Houses SHALL be integers 1..4 on active-owned monopoly assets with group spread at most one, counting unowned as zero. Rent and charge SHALL be positive playing payments for the turn owner, with no purchase or auction, and SHALL be mutually exclusive. Build quota SHALL be 0..1. Identical ordered inputs SHALL reproduce state and events.

#### Scenario: Valid mandatory payment state
- **WHEN** a game is created or restored under core-8 with an open rent or charge
- **THEN** the open payment SHALL belong to the turn owner, have a positive amount and SHALL not coexist with the other payment or a purchase or auction

#### Scenario: Replay charge payment
- **WHEN** an ordered log opens and settles a bank charge
- **THEN** replay SHALL reproduce the same charge state, events, balances and deadlines

#### Scenario: Restore pending rent
- **WHEN** a snapshot containing houses, quota and open rent is restored with its log tail
- **THEN** full state, events and pendingDeadlines SHALL match live execution

#### Scenario: Houses survive sibling expiry
- **WHEN** the zero-house asset in a [1,1,0] group is mortgaged and expires after eight laps
- **THEN** sibling houses and their house rent SHALL remain; the partial group SHALL pass invariants, BuildHouse SHALL reject GROUP_INCOMPLETE, and a legal maximum-house sale SHALL succeed
