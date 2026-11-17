## MODIFIED Requirements

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

### Requirement: House sale legality
SellHouse {assetId} SHALL require playing, the player's turn, no purchase or auction, an owned monopoly asset, at least one house and a group-maximum house count. Sales SHALL have no quota and SHALL be allowed during the payer's own open rent. Exported pure saleLegality SHALL share the handler's condition codes.

#### Scenario: Sale refund
- **WHEN** a legal sale is accepted
- **THEN** it SHALL remove one house, credit Q(50×Q(50×price/100)/100) with reason house-sale and emit HouseSold with playerId, assetId, houses and refund

#### Scenario: Uneven sale
- **WHEN** a player sells from a non-maximum asset in the group
- **THEN** it SHALL reject with UNEVEN_SALE without mutation

### Requirement: State validity and replay
Only core-7 SHALL be supported. Houses SHALL be integers 1..4 on monopoly assets owned by active players, with count spread at most one over the whole group, counting unowned assets as zero. Rent SHALL exist only in playing for the turn owner with positive amount and no purchase or auction. Build quota SHALL be 0..1. Identical ordered inputs SHALL reproduce state and events.

#### Scenario: Restore pending rent
- **WHEN** a snapshot containing houses, quota and open rent is restored with its log tail
- **THEN** full state, events and pendingDeadlines SHALL match live execution

#### Scenario: Houses survive sibling expiry
- **WHEN** the zero-house asset in a [1,1,0] group is mortgaged and expires after eight laps
- **THEN** sibling houses and their house rent SHALL remain; the partial group SHALL pass invariants, BuildHouse SHALL reject GROUP_INCOMPLETE, and a legal maximum-house sale SHALL succeed
