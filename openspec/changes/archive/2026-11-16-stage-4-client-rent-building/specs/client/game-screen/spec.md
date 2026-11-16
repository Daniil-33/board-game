## ADDED Requirements

### Requirement: Rent settlement display
While `view.rent` is non-null every viewer SHALL see the open settlement: payer name, owner name, asset name and amount, and for kind `energy` also the dice sum. When the viewer is the payer, the panel SHALL offer "Pay rent" labelled with the amount and the owner's name, enabled only while connected, the viewer is active, the turn deadline has not passed and no `PayRent` is pending. The client SHALL NOT compute the paid amount, a shortfall or balances; they come from later views.

#### Scenario: Payer sees the pay action
- **WHEN** the view's rent names the viewer as payer with amount 120 owed to Bob
- **THEN** the panel SHALL show a Pay rent control with 120 and Bob, and the settlement line

#### Scenario: Owner and spectators
- **WHEN** the owner, another participant, an eliminated player or a spectator sees the same view
- **THEN** each SHALL see the settlement line without a Pay rent control

#### Scenario: Energy settlement
- **WHEN** the open settlement has kind `energy` and dice sum 9
- **THEN** the line SHALL show the dice sum 9 together with the amount

#### Scenario: Settlement closed by a later view
- **WHEN** an accepted PayRent Ack arrives before the next Update
- **THEN** the panel SHALL remain until a view without `rent` arrives

### Requirement: Settlement does not block ending the turn
An open settlement SHALL NOT disable `EndTurn`. While a settlement is open and the viewer is the payer, the turn controls SHALL state that ending the turn pays the rent automatically.

#### Scenario: End turn with an open settlement
- **WHEN** the payer has rolled and the settlement is open
- **THEN** EndTurn SHALL be enabled and the automatic-payment note SHALL be visible

### Requirement: Houses and rent quote on the asset card
The asset card SHALL show the house count (0-4) from `view.houses` for monopoly assets and the current rent quote from `view.rentQuotes` for owned assets: a `fixed` quote as its amount, an `energy` quote as the formula with its `sumPrices`, `holdings` and `groupSize` and the rent for dice sums 2, 7 and 12 computed only with game-core `energyRentFor`. A free asset SHALL show no quote. An open card SHALL follow each new view.

#### Scenario: Regular, logistics and energy quotes
- **WHEN** the card shows an owned monopoly asset, an owned logistics asset and an owned energy asset
- **THEN** the first two SHALL show their fixed amounts and the energy asset SHALL show the formula and helper-computed examples

#### Scenario: House count updates
- **WHEN** a new view raises the selected asset's houses from 1 to 2
- **THEN** the open card SHALL show 2 houses and the new quote

### Requirement: Build and sell controls
For a monopoly asset owned by the viewer the asset card SHALL show Build and Sell controls; other viewers' assets and non-monopoly assets SHALL show none. Build SHALL show the house cost from game-core `houseCost(price)` and Sell the refund from `houseRefund(cost)`; the client SHALL NOT compute them otherwise. Each control SHALL be enabled only when game-core `buildLegality` / `saleLegality` on the current view returns no code and the connection checks pass.

#### Scenario: Legal build and sale
- **WHEN** the viewer owns a whole group with even houses, has the quota and the funds, and it is their turn
- **THEN** Build SHALL be enabled with its cost, and Sell SHALL be enabled with its refund on an asset holding the group maximum

#### Scenario: Not the owner
- **WHEN** the selected asset belongs to another player
- **THEN** the card SHALL show no Build or Sell control

### Requirement: Build quota display
While it is the viewer's turn, the controls SHALL show the builds left this turn from `view.turn.quotas.builds`. The client SHALL NOT compute or reset the quota; a bonus turn shows whatever the view projects.

#### Scenario: Quota used
- **WHEN** the view's turn quota shows zero builds after a build
- **THEN** the card SHALL show zero builds left and Build SHALL be disabled with the quota reason

### Requirement: Disabled control reasons
A disabled Build or Sell control SHALL show one reason text: the message mapped from the helper's `HouseErrorCode` (one message per code) or, when the helper allows it, the connection reason (disconnected, pending, deadline passed, not an active player).

#### Scenario: Each reason
- **WHEN** a helper returns any `HouseErrorCode`
- **THEN** the corresponding control SHALL be disabled and show that code's message

#### Scenario: Connection reason
- **WHEN** the helper allows a build but the client is disconnected
- **THEN** Build SHALL be disabled with the disconnected reason

### Requirement: Rent and building intents
`PayRent` SHALL be sent with payload `null`; `BuildHouse` and `SellHouse` with payload `{ assetId }` of the selected asset. All three SHALL target the projected turn. An accepted Ack SHALL NOT change houses, balances or the settlement locally.

#### Scenario: Accepted build
- **WHEN** the server accepts BuildHouse before the next Update
- **THEN** houses, balances and the settlement SHALL stay as last projected

### Requirement: Rejected house command reasons
A rejected Ack SHALL show its code and message. For a rejected `BuildHouse` or `SellHouse` with a `HouseErrorCode` it SHALL also show the mapped reason text; other commands sharing a code SHALL show no house reason.

#### Scenario: Illegal build rejected
- **WHEN** the server rejects BuildHouse with `UNEVEN_BUILD`
- **THEN** the HUD SHALL show the code, message and the uneven-build reason, and the view SHALL stay as last projected

#### Scenario: Shared code on another command
- **WHEN** the server rejects BuyAsset or Bid with `INSUFFICIENT_FUNDS`
- **THEN** the HUD SHALL show the code and message without a house reason

### Requirement: House markers
Every asset cell SHALL show 1-4 PixiJS house markers equal to `view.houses` for that asset and none when absent. Markers SHALL refresh on each view independently of movement animations, like owner markers.

#### Scenario: Houses change without board regeneration
- **WHEN** a new view changes an asset's houses from 2 to 3
- **THEN** that cell SHALL show three markers

### Requirement: Rent payment animation
A `RentPaid` event in an `Update` with `paid > 0` SHALL queue one step that shows the paid amount moving from the payer's token to the owner's token, in event order with other steps. It SHALL be the only event-driven element of stage 4; houses, balances and the settlement SHALL render from the view. A `Welcome` SHALL queue no rent animation, so a reload skips it. A malformed `RentPaid` payload SHALL yield no step.

#### Scenario: New payment
- **WHEN** an Update carries `RentPaid { payerId: A, ownerId: B, paid: 120 }`
- **THEN** one rent payment step from A to B with amount 120 SHALL be queued

#### Scenario: Reload
- **WHEN** a Welcome arrives whose view follows a RentPaid
- **THEN** no rent payment step SHALL be queued

## MODIFIED Requirements

### Requirement: Asset inspection
Clicking an asset cell SHALL open a Vue card showing its projected company name, category, group, monopoly rank when present, price, owner name or "free", and other group members with their prices and cell indices. A close control or Escape SHALL close the card. Clicking a non-asset cell SHALL open no card. The card SHALL use the current server board and view only; its only actions SHALL be the Build and Sell controls of the viewer's own monopoly assets.

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
