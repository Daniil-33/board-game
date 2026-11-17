## MODIFIED Requirements

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
