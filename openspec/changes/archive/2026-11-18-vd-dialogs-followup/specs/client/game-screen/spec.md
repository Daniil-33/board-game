## MODIFIED Requirements

### Requirement: Responsive decision and asset surfaces
Purchase decisions SHALL use a modal dialog on desktop and a bottom sheet on mobile only for the deciding player. Every other viewer SHALL see a live, non-modal purchase status with the deciding player, asset, price, and countdown. Auctions SHALL appear inline on desktop. On mobile, only the current responder SHALL see the auction in a non-dismissible bottom sheet; every other viewer SHALL see the live inline auction content. When a viewer becomes the responder, the mobile sheet SHALL open. Decision surfaces SHALL use the current projection and existing legality adapters. Asset inspection SHALL use the responsive dialog on desktop and a bottom sheet on mobile.

#### Scenario: Purchase surface by viewport
- **WHEN** a projected purchase decision is visible on desktop or mobile
- **THEN** it SHALL show the group gradient header, logo URL or monogram fallback, asset name and price, rent-table preview, buy and start-auction actions with disabled reasons, and the projected response countdown in the appropriate responsive surface
- **AND** the deciding player SHALL not be able to dismiss the response surface before answering

#### Scenario: Auction surface by viewport
- **WHEN** a projected auction is visible on desktop or mobile
- **THEN** desktop SHALL show it inline in the centre column and mobile SHALL show a bottom sheet for the current responder and inline content for everyone else, with the asset, projected leading bid and leader in that player's seat color, the existing legal bid increments, pass action, and response timer with a visible last-seconds state
- **AND** only the active responder's mobile sheet SHALL be non-dismissible

#### Scenario: Purchase response and bystanders
- **WHEN** a projected purchase decision is visible to the deciding player and to other participants, eliminated players, or spectators
- **THEN** only the deciding player SHALL see the non-dismissible dialog
- **AND** every other viewer SHALL see a non-modal status identifying who is deciding, the asset, its price, and the countdown

#### Scenario: Mobile auction responder and bystanders
- **WHEN** a projected auction is visible on mobile
- **THEN** only the current responder SHALL see the non-dismissible bottom sheet
- **AND** every other viewer SHALL see live inline auction content with the leader, bid, and timer
- **AND** the sheet SHALL open when a viewer becomes the responder

#### Scenario: Desktop auction viewers
- **WHEN** a projected auction is visible on desktop
- **THEN** every viewer SHALL see inline auction content with the leader, bid, and timer

#### Scenario: Other viewers keep access
- **WHEN** a non-deciding viewer sees a purchase status or a non-responder sees inline auction content
- **THEN** the status SHALL remain visible without a dialog and the auction SHALL remain visible inline
- **AND** chat SHALL remain available to the viewer

#### Scenario: Asset inspection from board and portfolio
- **WHEN** an asset is opened from its board cell or from “Мои активы”
- **THEN** the card SHALL show projected owner, houses and mortgage state, the complete rent table using game-core helpers with the current tier highlighted, and build, sell, mortgage and redeem actions only when the viewer owns the asset
