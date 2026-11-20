# Spec Delta

## MODIFIED Requirements

### Requirement: Liquidation events and payment
Each step SHALL emit balance and automatic asset or house events. LiquidationApplied SHALL follow with payerId, nullable creditorId, original debt, cashBefore, raised and ordered steps. Player creditors SHALL receive payment and rent SHALL retain RentPaid. Bank payments SHALL debit only the payer and emit ChargePaid. Landing debt SHALL stay fixed.

#### Scenario: Observable liquidation
- **WHEN** liquidation raises enough cash to settle rent owed to a player
- **THEN** step events SHALL precede LiquidationApplied, followed by rent balance changes and RentPaid for the full original amount

#### Scenario: Bank charge liquidation
- **WHEN** liquidation raises enough cash to settle a mandatory bank charge
- **THEN** step events SHALL precede LiquidationApplied with creditorId null, and the charge payment SHALL debit the payer without crediting a player

### Requirement: Bankruptcy payout and release
Bankruptcy SHALL sell all houses in legal order, take no mortgage advances, pay min(debt, resulting cash) to a player or bank, release owned assets in board order, and emit PlayerBankrupt. For bank debt, creditorId SHALL be null and no player SHALL be credited. AssetsReleased SHALL be emitted only for a nonempty portfolio; bankruptcy SHALL NOT emit LiquidationApplied or RentPaid.

#### Scenario: Payout and write off
- **WHEN** full liquidation cannot cover debt owed to a player and the payer has cash, houses and mortgages
- **THEN** the player creditor SHALL receive cash plus house refunds up to debt, writtenOff SHALL equal debt minus paid, and all payer owners, houses and mortgages SHALL be removed without advances

#### Scenario: Bank bankruptcy payout
- **WHEN** full liquidation cannot cover a bank charge and the payer has cash and houses
- **THEN** paid SHALL equal min(debt, cash plus house refunds), no player SHALL receive a balance credit, creditorId SHALL be null, and all payer assets SHALL return to the bank free

#### Scenario: Empty bankrupt portfolio
- **WHEN** the insolvent payer owns no assets and has zero cash
- **THEN** PlayerBankrupt SHALL record paid 0 and writtenOff equal debt, with no balance transfer or AssetsReleased

### Requirement: Bankruptcy elimination and outcome
Bankruptcy SHALL cancel the payer's offers, append eliminated and eliminations with reason bankrupt, trusted time and nullable creditorId (null for the bank), remove order membership, position, jail and mortgage pending membership, clear mandatory payments and pending bonus, and close the turn with reason bankrupt. With one survivor the game SHALL finish using the existing enriched GameEnded, without lap processing or a new turn.

#### Scenario: Surviving players continue
- **WHEN** the payer goes bankrupt with at least two other active players
- **THEN** one TurnEnded SHALL precede mortgage boundary processing and a regular turn for the successor in the old order with fresh quotas and deadline

#### Scenario: Terminal bankruptcy
- **WHEN** bankruptcy leaves one active player
- **THEN** phase SHALL be finished with winner and finishedAt, GameEnded SHALL include all balances and eliminations, and no mortgage expiry, new turn or deadline SHALL occur

#### Scenario: Bank creditor elimination
- **WHEN** bankruptcy settles a bank charge
- **THEN** PlayerBankrupt and the elimination record SHALL use creditorId null and the payer's turn SHALL close exactly once
