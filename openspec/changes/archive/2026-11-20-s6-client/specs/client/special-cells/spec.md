# client/special-cells Specification

## Purpose

Defines the client presentation and intents for the stage 6 special-cell and jail states.

## ADDED Requirements

### Requirement: Jail choice and public status
The client SHALL offer jail choices only to the active jailed player before rolling: attempt number (of three), attempt bar, `RollDice` action, and `PayJailFee` action. `PayJailFee` SHALL be disabled with a visible reason when cash is below `jailFee(economy)`, while allowing asset management. All viewers SHALL see jail status and a jailed-token marker. The UI SHALL explain the forced fee on attempt three.

#### Scenario: Active prisoner chooses an action
- **WHEN** the viewer owns the active, unrolled turn and is in jail
- **THEN** the choice card SHALL show the next attempt and send the corresponding command when either action is selected

#### Scenario: Observer sees jail status
- **WHEN** any player is jailed
- **THEN** every viewer SHALL see the jail marker on that player's token and panel entry, and the active turn header SHALL show the attempt count

### Requirement: Casino decision and result
The client SHALL offer a 50/50 bet only to the active player with an open casino decision, capped at `min(casinoCap(economy), cash)`, using legal multiples of 10 and win/loss previews. The actions SHALL send `PlaceCasinoBet {amount}` and `DeclineCasino`. If the cap is below 10 or payment is pending, bet SHALL be disabled with its reason while decline stays enabled. All viewers SHALL see non-modal casino status and a reduced-motion-aware result animation.

#### Scenario: Bet is unavailable
- **WHEN** the available cap is below 10 or a payment is pending
- **THEN** the bet action SHALL be disabled with its reason and decline SHALL remain enabled

#### Scenario: Casino resolves
- **WHEN** `CasinoResolved` is received
- **THEN** every viewer SHALL see whether the player won or lost and the amount

### Requirement: Chance card and bank charge
On `ChanceDrawn`, every viewer SHALL see a card flip with signed amount and the applicable signed percentage of starting capital. Gains SHALL identify the credited player. Losses SHALL show the amount due and the open charge SHALL use the rent payment pattern, send `PayCharge`, explain the shortfall and automatic settlement, and permit asset management while blocking build/redeem. Other viewers SHALL see non-modal charge status.

#### Scenario: Chance gain
- **WHEN** a positive chance card is drawn
- **THEN** every viewer SHALL see the signed credit amount and credited player

#### Scenario: Chance loss
- **WHEN** a negative chance card opens a charge for the viewer
- **THEN** the charge card SHALL offer payment and asset management and show the shortfall and automatic settlement note

### Requirement: Redeem lock reason
When a mortgage's `lockedTurnId` matches the current turn id, the client's redeem action SHALL be disabled with the localized reason “Выкуп доступен со следующего хода”.

#### Scenario: Redeem is locked this turn
- **WHEN** the viewer owns a mortgaged asset locked to the active turn
- **THEN** the redeem action SHALL be disabled with `MORTGAGE_REASONS.REDEEM_LOCKED`

### Requirement: Stage 6 journal localization
The journal SHALL describe new casino and jail events naturally in Russian and English. Chance cards SHALL use localized signed percentage and amount labels instead of raw card ids.

#### Scenario: Chance event is localized
- **WHEN** a viewer's journal renders any supported chance card
- **THEN** it SHALL show a localized signed label such as “+5% капитала, +1 490” or “−10% капитала, −2 990”
