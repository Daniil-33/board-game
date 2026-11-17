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
PayRent SHALL require payload null, a turn target, the turn owner, an unexpired turn and an open settlement. Payment SHALL transfer min(amount,balance) and clear rent. RentPaid SHALL record payerId, ownerId, assetId, amount, paid, shortfall and auto. BalanceChanged reason rent SHALL debit the payer and credit the owner only for positive paid.

#### Scenario: Interim shortfall
- **WHEN** an explicit rent payment exceeds the payer balance
- **THEN** paid SHALL equal the balance, shortfall SHALL equal amount minus paid, auto SHALL be false and neither balance SHALL become negative

#### Scenario: Automatic payment
- **WHEN** EndTurn, turn Timeout or another closure occurs with rent open
- **THEN** mandatory payment SHALL happen before closure with auto true and no separate rent deadline

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
SellHouse {assetId} SHALL require playing, the player's turn, no purchase or auction, an owned monopoly asset, at least one house and a group-maximum house count. Sales SHALL have no quota and SHALL be allowed during the payer's own open rent. Exported pure saleLegality SHALL share the handler's condition codes.

#### Scenario: Sale refund
- **WHEN** a legal sale is accepted
- **THEN** it SHALL remove one house, credit Q(50×Q(50×price/100)/100) with reason house-sale and emit HouseSold with playerId, assetId, houses and refund

#### Scenario: Uneven sale
- **WHEN** a player sells from a non-maximum asset in the group
- **THEN** it SHALL reject with UNEVEN_SALE without mutation

### Requirement: Provisional rent resignation
Resignation during rent SHALL use the isolated R1/R2 defaults: a resigning payer or owner drops settlement without payment; an unrelated resignation preserves it unless the game finishes. The PR SHALL remain unmerged until the CTO answer is recorded in ROADMAP.md.

#### Scenario: Payer or owner departure
- **WHEN** either settlement participant resigns
- **THEN** rent SHALL clear without balance changes, including when the game finishes

### Requirement: State validity and replay
Only core-7 SHALL be supported. Houses SHALL be integers 1..4 on monopoly assets owned by active players, with count spread at most one over the whole group, counting unowned assets as zero. Rent SHALL exist only in playing for the turn owner with positive amount and no purchase or auction. Build quota SHALL be 0..1. Identical ordered inputs SHALL reproduce state and events.

#### Scenario: Restore pending rent
- **WHEN** a snapshot containing houses, quota and open rent is restored with its log tail
- **THEN** full state, events and pendingDeadlines SHALL match live execution

#### Scenario: Houses survive sibling expiry
- **WHEN** the zero-house asset in a [1,1,0] group is mortgaged and expires after eight laps
- **THEN** sibling houses and their house rent SHALL remain; the partial group SHALL pass invariants, BuildHouse SHALL reject GROUP_INCOMPLETE, and a legal maximum-house sale SHALL succeed
