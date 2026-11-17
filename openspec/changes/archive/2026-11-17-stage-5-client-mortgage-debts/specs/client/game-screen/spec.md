# Spec Delta

## MODIFIED Requirements

### Requirement: Asset inspection
Clicking an asset cell SHALL open a Vue card showing its projected company name, category, group, monopoly rank when present, price, owner name or "free", and other group members with their prices and cell indices. A close control or Escape SHALL close the card. Clicking a non-asset cell SHALL open no card. The card SHALL use the current server board and view only; its actions SHALL be Build and Sell for the viewer's own monopoly assets and Mortgage and Redeem for any of the viewer's own assets.

#### Scenario: Monopoly details
- **WHEN** a player clicks a monopoly asset
- **THEN** its card SHALL show company, category, group, rank, price and all other assets with the same groupId and their prices and cells

#### Scenario: Logistics and energy details
- **WHEN** a logistics or energy asset is selected
- **THEN** its card SHALL show its projected category, group, price, owner name or "free", and other group members without inventing a monopoly rank

#### Scenario: Dismiss card
- **WHEN** an open card receives Escape or its close control is clicked
- **THEN** the card SHALL close

#### Scenario: Special cell click
- **WHEN** no card is open and a non-asset cell is clicked
- **THEN** no card SHALL open

#### Scenario: Ownership changes
- **WHEN** a new view assigns the selected asset an owner
- **THEN** the open card SHALL display that owner from the current projection

### Requirement: Confirmed resignation and spectator
Setup and play SHALL offer Resign to connected non-eliminated participants,
independent of turn/deadline. Confirmation SHALL explain permanent elimination
and continued watching. Cancel SHALL send no command. Confirmation SHALL send
one Resign intent; pending resignation SHALL prevent duplicate sends. Rejection
SHALL be visible. Elimination SHALL occur visually only after server projection.
An eliminated viewer SHALL remain connected, see “You are out” with the projected elimination reason (`resigned` or `bankrupt`), and retain read-only viewing without enabled gameplay controls.

#### Scenario: Cancel
- **WHEN** the player cancels resignation confirmation
- **THEN** no Resign SHALL be sent and the screen SHALL keep following the view

#### Scenario: Three-player spectator
- **WHEN** the server eliminates the viewer while two others remain active
- **THEN** the viewer SHALL keep receiving the game and see their out status

#### Scenario: Bankruptcy spectator
- **WHEN** the viewer appears in view.eliminations with reason bankrupt
- **THEN** the elimination screen SHALL show bankrupt and keep the board and subsequent views available without enabled gameplay controls

### Requirement: Game over
Every viewer SHALL show a game-over screen on phase finished, rendering the winner, elimination order with reasons and times, and final balances from `view.result`, without game controls and offering return to lobby. This SHALL work from setup
without positions and from play, including for eliminated viewers. Returning
SHALL disconnect and clear the local room without sending pre-start Leave.

#### Scenario: Last opponent resigns
- **WHEN** a finished projection names the surviving winner
- **THEN** both clients SHALL show that winner and a return-to-lobby control

#### Scenario: Finish during setup
- **WHEN** finished arrives with no positions or turn
- **THEN** game over SHALL render without requiring a playing-state board

#### Scenario: Reload finished game
- **WHEN** a Welcome supplies a finished view after reload or remount
- **THEN** the screen SHALL show the same projected result without requiring GameEnded events

### Requirement: Rent payment animation
A `RentPaid` event in an `Update` with `amount > 0` SHALL queue one step that shows the paid amount moving from the payer's token to the owner's token, in event order with other steps. Houses, mortgages, balances and the settlement SHALL render from the view independently of event notices. A `Welcome` SHALL queue no rent animation, so a reload skips it. A malformed `RentPaid` payload SHALL yield no step.

#### Scenario: New payment
- **WHEN** an Update carries `RentPaid { payerId: A, ownerId: B, amount: 120 }`
- **THEN** one rent payment step from A to B with amount 120 SHALL be queued

#### Scenario: Reload
- **WHEN** a Welcome arrives whose view follows a RentPaid
- **THEN** no rent payment step SHALL be queued

## ADDED Requirements

### Requirement: Mortgage controls
For the viewer's own assets the card SHALL offer Mortgage and Redeem, using game-core mortgageLegality and redeemLegality plus connection, pending and deadline checks. Labels SHALL show mortgageAdvance(price) and the stored redeem advance (or the helper advance when unmortgaged). Each disabled action SHALL show one mapped message per MortgageErrorCode, or the connection reason when legal.

#### Scenario: Own and other assets
- **WHEN** the selected asset belongs to the viewer or another player
- **THEN** Mortgage and Redeem SHALL respectively appear or be absent

#### Scenario: Every legality reason
- **WHEN** either helper returns any MortgageErrorCode
- **THEN** its action SHALL be disabled with that code's mapped message

#### Scenario: Rent remains open
- **WHEN** the viewer's own rent settlement is open
- **THEN** legal Mortgage and Sell SHALL remain available while Redeem and Build show RENT_PENDING

#### Scenario: Amount labels
- **WHEN** the asset is unmortgaged or mortgaged
- **THEN** the labels SHALL show the shared helper advance and the actual stored redemption amount respectively

### Requirement: Projected mortgage terms
A mortgaged asset card SHALL show mortgaged, remainingLaps and the names of pending players from view.mortgages. Its rent quote SHALL show projected zero rent. Terms and quotes SHALL refresh from each view without local lap counting.

#### Scenario: Term progresses or ends
- **WHEN** a view changes remainingLaps or pending, or removes the mortgage by redemption or expiry
- **THEN** the open card SHALL immediately show the current terms or remove the mortgage state

### Requirement: Public liquidation summary
Every viewer SHALL receive a summary of each LiquidationApplied: payer, creditor, debt, ordered steps with tier, kind, asset and amount, total raised and payment. Payment SHALL use the matching RentPaid event in that update. Summaries SHALL be independent of the animation queue and SHALL NOT compute game outcomes.

#### Scenario: All tiers and kinds
- **WHEN** an update contains tier 1 and 2 mortgage steps and tier 3 sell-house and mortgage steps
- **THEN** all viewers SHALL see every step in event order and the event-provided raised and payment amounts

#### Scenario: Multiple updates
- **WHEN** another update arrives after a liquidation
- **THEN** the preceding summary SHALL remain available during that room session

### Requirement: Public bankruptcy notice
Every viewer SHALL see each PlayerBankrupt notice with player, creditor, debt, paid and writtenOff, together with the assetIds of that player's bankrupt AssetsReleased event in the same update. An absent release event SHALL mean no freed assets listed.

#### Scenario: Release with bankruptcy
- **WHEN** an update contains AssetsReleased and PlayerBankrupt
- **THEN** the notice SHALL show the event amounts and freed assets without inferring them from ownership differences

#### Scenario: No owned assets
- **WHEN** PlayerBankrupt arrives without AssetsReleased
- **THEN** the notice SHALL show the bankruptcy and an empty freed asset list

### Requirement: Mortgage cell markers
Each asset in view.mortgages SHALL have a distinct PixiJS mortgage marker. Each view SHALL refresh these independently of movement animations.

#### Scenario: Mortgage changes on the same board
- **WHEN** a new view adds or removes a mortgage without regenerating the board
- **THEN** the corresponding marker SHALL appear or disappear immediately
