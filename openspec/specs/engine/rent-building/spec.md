# engine/rent-building Specification

## Purpose
Defines deterministic asset rent, mandatory settlement and even house construction and sale for the stage 4 economy.

## Requirements

### Requirement: Regular rent
Regular rent SHALL be zero on mortgaged assets; otherwise zero-house rent SHALL be Q(5×price/100), doubled as 2×Q(5×price/100) for a wholly owned group, counting mortgaged group assets. Rent for 1/2/3/4 houses SHALL be Q(15/35/65/100×price/100).

#### Scenario: Every regular price
- **WHEN** rent is quoted for each prices-1 regular price at 0..4 houses with and without a complete group
- **THEN** it SHALL match the corresponding integer formula

### Requirement: Logistics and energy rent
Logistics rent SHALL be Q(p×landedPrice/100), p=5/10/20/40 for 1/2/3/4 non-mortgaged holdings. Energy rent SHALL be Q(sumPrices×diceSum×holdings/(200×groupSize)). A mortgaged landed asset SHALL yield zero. Mortgage checks SHALL read the persisted mortgage record.

#### Scenario: Holdings and dice tables
- **WHEN** each logistics holding count and each energy holding count 1..2 with dice sums 2..12 is evaluated
- **THEN** rent SHALL match the formula with quantization only at the operation boundary

### Requirement: Landing settlement
An actual move onto another active player's positive-rent asset SHALL create rent with payerId, ownerId, assetId, cell, kind, amount and diceSum (null except energy), fixed at landing, and emit RentDue. Own assets and zero rent SHALL create no settlement. Free assets SHALL retain the purchase path.

#### Scenario: Jail release
- **WHEN** a jail attempt releases the player and moves them onto a rented asset
- **THEN** the same landing rules SHALL apply using the release roll sum

#### Scenario: Failed jail attempt
- **WHEN** a jail attempt fails without movement
- **THEN** no new landing settlement SHALL open

### Requirement: Mandatory payment
PayRent SHALL require payload null, a turn target, the turn owner, an unexpired turn and an open settlement. Payment SHALL use the shared debt settlement behavior and clear rent. Successful payment SHALL transfer the full amount and emit RentPaid {payerId, ownerId, assetId, amount, auto}. BalanceChanged reason rent SHALL debit the payer and credit the owner only for positive payment. Bankruptcy SHALL use PlayerBankrupt instead of RentPaid.

#### Scenario: Cash payment
- **WHEN** an explicit rent payment is covered by the payer balance
- **THEN** the full amount SHALL transfer with auto false and the payer SHALL retain excess cash and assets

#### Scenario: Liquidated payment
- **WHEN** cash is insufficient but full liquidation value covers rent
- **THEN** liquidation SHALL stop at the first covering step before full payment, and RentPaid SHALL have auto false

#### Scenario: Automatic payment
- **WHEN** EndTurn, turn Timeout or another closure occurs with rent open
- **THEN** shared debt settlement SHALL happen before closure with auto true and no separate rent deadline

#### Scenario: Interim shortfall
- **WHEN** full liquidation value cannot cover rent
- **THEN** the payer SHALL go bankrupt with a partial payout and write-off through PlayerBankrupt, and no interim shortfall payment SHALL occur

### Requirement: Building legality
BuildHouse {assetId} SHALL require playing, the player's turn, no purchase/auction/rent, a monopoly asset owned by the player, complete group, no group mortgage, fewer than four houses, a group-minimum house count, positive build quota and sufficient funds. Exported pure buildLegality SHALL return the same specific condition code used by the handler for an unexpired command.

#### Scenario: Build and rejection
- **WHEN** a legal build is accepted
- **THEN** it SHALL debit Q(50×price/100), add one house, consume one build quota and emit HouseBuilt with playerId, assetId, houses and cost

#### Scenario: Every failed condition
- **WHEN** any build condition fails
- **THEN** its specific rejection code SHALL be returned with unchanged state, revision and RNG

### Requirement: House command deadlines and display legality
Pure buildLegality and saleLegality SHALL ignore time. After envelope and payload validation, the server SHALL check auction pause (AUCTION_IN_PROGRESS), turn ownership (NOT_ACTIVE_PLAYER), then deadline (DEADLINE_PASSED) before calling either helper.

#### Scenario: Auction pause outlasts the original deadline
- **WHEN** BuildHouse or SellHouse is sent during an auction at the original turn deadline plus 5000 ms
- **THEN** the server SHALL reject with AUCTION_IN_PROGRESS before checking ownership, deadline or asset legality

#### Scenario: Expired illegal construction or sale
- **WHEN** BuildHouse or SellHouse names an illegal asset at or after the turn deadline without an auction pause and is issued by the turn owner
- **THEN** the server SHALL reject with DEADLINE_PASSED before checking asset legality, while the pure display helper SHALL continue to report the asset condition without considering time

### Requirement: House sale legality
SellHouse {assetId} SHALL require playing, the player's turn, no purchase or auction, an owned monopoly asset, at least one house and a group-maximum house count. Sales SHALL have no quota and SHALL be allowed during the payer's own open rent. Exported pure saleLegality SHALL share the handler's condition codes. HouseSold SHALL include auto false for a manual sale and true for a debt-driven sale.

#### Scenario: Sale refund
- **WHEN** a legal sale is accepted
- **THEN** it SHALL remove one house, credit Q(50×Q(50×price/100)/100) with reason house-sale and emit HouseSold with playerId, assetId, houses, refund and auto false

#### Scenario: Uneven sale
- **WHEN** a player sells from a non-maximum asset in the group
- **THEN** it SHALL reject with UNEVEN_SALE without mutation

#### Scenario: Automatic sale
- **WHEN** debt settlement sells one house
- **THEN** HouseSold SHALL carry auto true with the same quantized refund and resulting house count

### Requirement: Provisional rent resignation
Resignation during rent SHALL use the isolated R1/R2 defaults: a resigning payer or owner drops settlement without payment; an unrelated resignation preserves it unless the game finishes. The PR SHALL remain unmerged until the CTO answer is recorded in ROADMAP.md.

#### Scenario: Payer or owner departure
- **WHEN** either settlement participant resigns
- **THEN** rent SHALL clear without balance changes, including when the game finishes

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

#### Scenario: Resigning charge payer
- **WHEN** the payer resigns while a bank charge is open
- **THEN** the charge SHALL be voided before turn closure with no debit, bankruptcy or ChargePaid event; a two-player game SHALL end as an ordinary resignation and a three-player game SHALL start the next player's turn

### Requirement: Charge payment guards
While a charge is open, building and redemption SHALL fail with PAYMENT_PENDING. Mortgage and house sale SHALL remain allowed. Existing rent guards and their RENT_PENDING code SHALL remain unchanged.

#### Scenario: Asset actions during charge
- **WHEN** the payer attempts build, redeem, mortgage or house sale during an open charge
- **THEN** build and redeem SHALL return PAYMENT_PENDING, while mortgage and house sale SHALL remain legal when their other conditions pass
