## ADDED Requirements

### Requirement: Responsive decision and asset surfaces
Purchase decisions SHALL use a modal dialog on desktop and a bottom sheet on mobile. Asset inspection SHALL use the responsive dialog on desktop and a bottom sheet on mobile. Auctions SHALL appear inline in the desktop centre column and in a bottom sheet on mobile. These surfaces SHALL use the current projection and existing legality adapters.

#### Scenario: Purchase surface by viewport
- **WHEN** a projected purchase decision is visible on desktop or mobile
- **THEN** it SHALL show the group gradient header, logo URL or monogram fallback, asset name and price, rent-table preview, buy and decline actions with disabled reasons, and the projected response countdown in the appropriate responsive surface

#### Scenario: Auction surface by viewport
- **WHEN** a projected auction is visible on desktop or mobile
- **THEN** desktop SHALL show it inline in the centre column and mobile SHALL show it in a bottom sheet, with the asset, projected leading bid and leader in that player's seat color, the existing legal bid increments, pass action, and response timer with a visible last-seconds state

#### Scenario: Asset inspection from board and portfolio
- **WHEN** an asset is opened from its board cell or from “Мои активы”
- **THEN** the card SHALL show projected owner, houses and mortgage state, the complete rent table using game-core helpers with the current tier highlighted, and build, sell, mortgage and redeem actions only when the viewer owns the asset

#### Scenario: Hover tooltip follows mortgage view changes
- **WHEN** a desktop pointer remains over an asset cell while a new view changes its mortgage state
- **THEN** the “Asset inspection” → “Desktop hover” tooltip SHALL show the company name and price, append “· В залоге” when mortgaged, omit the suffix otherwise, and refresh without pointer movement

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
Every dialog and sheet SHALL trap focus, expose `aria-modal="true"`, return outside focus attempts to its content, and restore focus when dismissed. Escape SHALL dismiss only surfaces that do not require a rules response; surfaces requiring an answer SHALL retain their current non-dismissible behavior.

#### Scenario: Modal focus containment
- **WHEN** a dialog or sheet is open and a focus attempt targets content outside it
- **THEN** focus SHALL remain inside the open surface and the surface SHALL expose `aria-modal="true"`

#### Scenario: Escape policy
- **WHEN** Escape is pressed with an asset inspection surface or another dismissable surface open
- **THEN** that surface SHALL close and return focus to its opener
- **WHEN** Escape is pressed with a purchase decision, auction response, rent payment or other required response open
- **THEN** that surface SHALL remain open
