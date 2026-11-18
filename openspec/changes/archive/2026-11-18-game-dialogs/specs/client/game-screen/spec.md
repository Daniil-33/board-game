## MODIFIED Requirements

### Requirement: Asset inspection
Clicking or tapping an asset cell, or choosing an owned asset from “Мои активы”, SHALL open a responsive asset inspection surface using only the current server board and projection. It SHALL show the projected company name, category, group, monopoly rank when present, price, owner name or “free”, group members with prices and cell indices, houses and mortgage state. Its rent schedule SHALL come from game-core display helpers and highlight the current tier from projected owners, houses and rent quotes. Build, sell, mortgage and redeem actions SHALL appear only when the viewer owns the asset. Dismissing the surface SHALL restore focus to its board-cell or portfolio opener.

#### Scenario: Card content
- **WHEN** an asset inspection surface opens
- **THEN** it SHALL show the projected company name, category, group, rank when present, price, owner name or “free”, and other group members with their prices and cell indices

#### Scenario: Actions on owned assets
- **WHEN** the viewer opens their own asset card
- **THEN** it SHALL offer Mortgage and Redeem for the asset and Build and Sell for a monopoly asset; cards for other assets SHALL omit these actions

#### Scenario: Monopoly details
- **WHEN** a player opens a monopoly asset
- **THEN** its card SHALL show the company, category, group, rank, price and other assets with the same groupId, prices and cell indices

#### Scenario: Logistics and energy details
- **WHEN** a logistics or energy asset is selected
- **THEN** its card SHALL show its projected category, group, price, owner name or “free”, and other group members without inventing a monopoly rank

#### Scenario: Rent schedule tiers
- **WHEN** an asset card opens for a regular, logistics or energy asset
- **THEN** the table SHALL show the public schedule from game-core: regular base, complete-group base and one through four houses; logistics rent by one through four holdings; or energy rent rates for dice sums 2 through 12
- **AND** energy values SHALL be presented as per-dice-sum rates, not as one fixed rent

#### Scenario: Current tier follows the view
- **WHEN** a new view changes the selected asset's projected owners, houses or rent quote
- **THEN** the highlighted row SHALL reflect the current rent tier from those projected values

#### Scenario: Dismiss card
- **WHEN** an open asset card receives Escape or its close control is clicked
- **THEN** the card SHALL close and focus SHALL return to its opener

#### Scenario: Special cell click
- **WHEN** no card is open and a non-asset cell is clicked
- **THEN** no card SHALL open

#### Scenario: Ownership changes
- **WHEN** a new view assigns the selected asset an owner
- **THEN** the open card SHALL display that owner from the current projection

#### Scenario: Desktop hover
- **WHEN** the pointer hovers over an asset cell on a hover-capable desktop
- **THEN** its tooltip SHALL show the full company name and formatted projected price
- **AND** it SHALL append “· В залоге” when mortgaged, omit the suffix otherwise, and refresh when a view changes the mortgage state while the pointer remains still

#### Scenario: Portfolio opener focus return
- **WHEN** an asset card is opened from “Мои активы” and dismissed
- **THEN** focus SHALL return to that asset's portfolio control

## ADDED Requirements

### Requirement: Responsive decision and asset surfaces
Purchase decisions SHALL use a modal dialog on desktop and a bottom sheet on mobile. Asset inspection SHALL use the responsive dialog on desktop and a bottom sheet on mobile. Auctions SHALL appear inline in the desktop centre column and in a bottom sheet on mobile. These surfaces SHALL use the current projection and existing legality adapters.

#### Scenario: Purchase surface by viewport
- **WHEN** a projected purchase decision is visible on desktop or mobile
- **THEN** it SHALL show the group gradient header, logo URL or monogram fallback, asset name and price, rent-table preview, buy and start-auction actions with disabled reasons, and the projected response countdown in the appropriate responsive surface
- **AND** the deciding player SHALL not be able to dismiss the response surface before answering

#### Scenario: Auction surface by viewport
- **WHEN** a projected auction is visible on desktop or mobile
- **THEN** desktop SHALL show it inline in the centre column and mobile SHALL show it in a bottom sheet, with the asset, projected leading bid and leader in that player's seat color, the existing legal bid increments, pass action, and response timer with a visible last-seconds state
- **AND** only the active responder's mobile sheet SHALL be non-dismissible

#### Scenario: Other viewers keep access
- **WHEN** a non-deciding viewer sees a purchase dialog or a non-responder sees a mobile auction sheet
- **THEN** Escape SHALL dismiss that viewer's presentation without affecting the pending decision or auction
- **AND** chat SHALL remain available to the viewer

#### Scenario: Asset inspection from board and portfolio
- **WHEN** an asset is opened from its board cell or from “Мои активы”
- **THEN** the card SHALL show projected owner, houses and mortgage state, the complete rent table using game-core helpers with the current tier highlighted, and build, sell, mortgage and redeem actions only when the viewer owns the asset

### Requirement: Rent shortfall and debt resolution surfaces
The rent surface SHALL show the amount due and creditor, a shortfall hint with the amount missing when projected data indicates a shortfall, and entry points for manual mortgage and sale. Debt notices SHALL show the liquidation summary, including sold or mortgaged assets and amounts from the view. Clients SHALL NOT calculate amounts from design examples.

#### Scenario: Rent with and without shortfall
- **WHEN** a rent view shows the payer's shortfall or sufficient funds
- **THEN** the panel SHALL show the projected amount and creditor and SHALL show the missing amount only in the shortfall case

#### Scenario: Liquidation summary
- **WHEN** a view contains liquidation steps
- **THEN** the summary SHALL list each sold or mortgaged asset and its projected amount

### Requirement: Elimination and game-over presentation
Elimination and game-over surfaces SHALL show final standings from the view and offer leave or back-to-lobby actions. An eliminated player SHALL remain able to watch the game and use chat.

#### Scenario: Eliminated player keeps watching
- **WHEN** the viewer is eliminated while the game continues
- **THEN** the elimination screen SHALL be visible while current game state and chat remain available

#### Scenario: Game over standings
- **WHEN** the projected game is complete
- **THEN** the game-over screen SHALL show final standings from the view and provide a leave or back-to-lobby action

### Requirement: Decision surface accessibility
Every dialog and sheet SHALL trap focus, expose `aria-modal="true"`, return outside focus attempts to its content, and restore focus when dismissed. Escape SHALL dismiss only surfaces for which the viewer has no required rules response.

#### Scenario: Modal focus containment
- **WHEN** a dialog or sheet is open and a focus attempt targets content outside it
- **THEN** focus SHALL remain inside the open surface and the surface SHALL expose `aria-modal="true"`

#### Scenario: Escape policy
- **WHEN** Escape is pressed with an asset inspection surface or another dismissable surface open
- **THEN** that surface SHALL close and return focus to its opener
- **WHEN** Escape is pressed with a deciding player's purchase response, an active responder's auction sheet, rent payment or game-over open
- **THEN** that surface SHALL remain open
- **WHEN** Escape is pressed with a purchase or auction surface open for a viewer who has no response to make
- **THEN** that viewer's surface SHALL close while the underlying chat remains usable
