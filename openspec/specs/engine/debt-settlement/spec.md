# engine/debt-settlement Specification

## Purpose

Defines atomic mandatory debt payment through cash, deterministic tiered liquidation, or bankruptcy and permanent elimination.

## Requirements

### Requirement: Debt case selection
Mandatory debt SHALL use cash only if sufficient. Otherwise, if cash plus refunds for all houses plus advances for all non-mortgaged owned assets is less than debt, bankruptcy SHALL happen immediately. Otherwise tiered liquidation SHALL run, stopping after the first single step that covers debt. Money SHALL remain integer quanta and balances nonnegative.

#### Scenario: Cash covers debt
- **WHEN** cash equals or exceeds debt
- **THEN** the debt SHALL be paid with no liquidation or bankruptcy events and no portfolio changes

#### Scenario: Solvency boundary
- **WHEN** full liquidation value equals debt
- **THEN** liquidation SHALL cover payment; a value 10 below debt SHALL instead cause immediate bankruptcy without any new mortgage

### Requirement: Complete groups and current asset order
A complete group SHALL mean a wholly owned monopoly group, all four logistics, or both energy assets, counting mortgaged assets. Asset ordering SHALL be ascending by current rent, price, assetId. Current rent SHALL be recomputed before every step, using dice sum 7 for energy and zero for mortgages.

#### Scenario: Logistics order changes
- **WHEN** a logistics asset is mortgaged during liquidation
- **THEN** subsequent asset comparisons SHALL use rents computed with the remaining non-mortgaged holdings

#### Scenario: Ties and energy
- **WHEN** candidate rents tie, including an energy quote evaluated at dice sum 7
- **THEN** lower price SHALL precede higher price and assetId SHALL break remaining ties

### Requirement: Bare asset tiers
Tier 1 SHALL mortgage non-mortgaged bare assets outside complete groups in asset order. When exhausted, tier 2 SHALL mortgage non-mortgaged bare assets inside complete groups in asset order. Assets with houses SHALL be excluded from both tiers, including partial groups left by mortgage expiry.

#### Scenario: Tier boundaries
- **WHEN** tier 1 cannot cover debt but tier 2 can
- **THEN** all tier 1 candidates SHALL precede tier 2, and liquidation SHALL stop immediately after the covering mortgage

### Requirement: Built asset tier
Tier 3 SHALL choose the lowest group key (sum of current rent of built assets, sum of their prices, groupId), then stay in that group until bare. It SHALL sell from the most built asset, breaking ties by current asset order, and mortgage that asset immediately when bare unless the sale already covers debt. Partial groups with houses SHALL participate.

#### Scenario: Covering sale leaves bare asset
- **WHEN** selling the last house on an asset covers debt
- **THEN** liquidation SHALL stop with that asset bare and unmortgaged

#### Scenario: Group order and even sales
- **WHEN** tiers 1 and 2 are exhausted and multiple groups contain houses
- **THEN** tier 3 SHALL select by the group key, sell one house at a time from group-maximum assets, and finish the chosen group before choosing another

#### Scenario: Partial group after expiry
- **WHEN** an expiry left the payer a partial group with houses
- **THEN** its built assets SHALL be reached in tier 3 and sold in legal even order

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

### Requirement: Debt atomicity and replay
Explicit payment and all mandatory turn closures SHALL use the same debt behavior atomically within one accepted command revision. Rejected commands SHALL preserve state and RNG. Replay and snapshot restoration across liquidation, bankruptcy and finish SHALL reproduce full state, events and deadlines exactly.

#### Scenario: Explicit and automatic bankruptcy
- **WHEN** identical insolvent rent is resolved by PayRent, EndTurn or a post-roll Timeout
- **THEN** each SHALL eliminate the payer and close their turn exactly once with the same payout and outcome

#### Scenario: Restore bankruptcy and finish
- **WHEN** sessions are restored from snapshots after bankruptcy or finish and from earlier snapshots with debt log tails
- **THEN** their state, events, RNG and deadlines SHALL equal live execution
