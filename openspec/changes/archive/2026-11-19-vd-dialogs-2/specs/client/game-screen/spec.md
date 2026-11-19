## MODIFIED Requirements

### Requirement: Board-centre phase caption
The board-centre caption SHALL describe the current projected game phase: turn-order roll, regular roll, rent or debt, and game over. It SHALL update when the projected phase changes and SHALL NOT retain a caption from a prior phase.

#### Scenario: Auction caption
- **WHEN** the projection contains an active auction
- **THEN** the board-centre caption SHALL be hidden using the board display input

#### Scenario: Finished game caption
- **WHEN** the projection phase is finished
- **THEN** the board-centre caption describes the completed game

### Requirement: Action buttons follow the view
`RollForOrder` SHALL require setup and viewer `setup.playerId`. `RollDice` SHALL require playing, viewer turn ownership and `rolled: false`; `EndTurn` SHALL require playing, viewer ownership and `rolled: true`. Buttons SHALL be disabled while disconnected, while the command type is pending, or past the server deadline. The turn panel SHALL show current-phase actions only, make the applicable action primary, and keep unavailable actions visible, disabled, with visible text reasons.

#### Scenario: Before and after the roll
- **WHEN** it is the viewer's regular turn before the roll, then after the roll
- **THEN** only the applicable action is enabled and primary, unavailable regular-turn actions remain visible and disabled with their visible reasons, and the setup-only order roll is hidden

#### Scenario: My order roll
- **WHEN** the phase is setup and setup.playerId is the viewer
- **THEN** only the setup flow's RollForOrder action is shown as applicable and regular-turn actions are hidden

#### Scenario: Not my turn
- **WHEN** the view's turn.playerId is another player
- **THEN** RollDice and EndTurn SHALL be disabled and one visible reason message SHALL identify that player instead of repeating a reason for each button

#### Scenario: Pending command
- **WHEN** the viewer pressed RollDice and its Ack has not arrived
- **THEN** RollDice SHALL be disabled

#### Scenario: Auction in progress
- **WHEN** a player views an ongoing auction or purchase decision
- **THEN** regular-turn RollDice and EndTurn actions SHALL NOT be shown
### Requirement: Responsive decision and asset surfaces
Purchase response SHALL use a modal dialog on desktop or bottom sheet on mobile only for the decider; others SHALL see non-modal status. Auctions SHALL be inline on desktop. On mobile, only the current responder SHALL see a sheet; others SHALL see inline content, and it SHALL open when its viewer becomes responder. Decision surfaces SHALL use the current projection and legality adapters. Asset inspection SHALL use a responsive dialog on desktop and bottom sheet on mobile.

#### Scenario: Purchase surface by viewport
- **WHEN** a projected purchase decision is visible on desktop or mobile
- **THEN** it SHALL show the group gradient, logo or monogram, category, asset name, price, rent preview, current balance, exact post-purchase balance when affordable, legal actions and countdown, with disabled reasons and the timeout note
- **AND** the rent preview SHALL remain visible or expandable at mobile widths
- **AND** the post-purchase balance SHALL equal the projected balance minus the fixed asset price as specified in purchase-auction.ts:131-134; when unaffordable it SHALL be omitted and the existing insufficient-funds reason SHALL appear on Buy
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
- **THEN** the card SHALL show its projected owner, group chips with owners and houses, full rent table with a percent-of-price column and projected current tier highlighted, house-cost and mortgage tiles, and owner actions with their mapped reasons
- **AND** a mortgage term SHALL be shown only when supplied by the projection
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
- **THEN** the winner SHALL be first with place 1, followed by eliminated players in standings order with projected reasons, times and final balances; the screen SHALL provide a leave or back-to-lobby action

## ADDED Requirements

### Requirement: Projected rent details
The rent surface SHALL identify payer and asset, show the projected creditor and amount due, and derive any displayed shortfall only from projected balance and rent.

#### Scenario: Projected rent context
- **WHEN** a rent view is shown
- **THEN** the payer, asset, creditor and amount due SHALL come from the projection

### Requirement: Projected elimination details
Elimination and game-over surfaces SHALL show projected reasons and times, winner-first standings with final balances, and existing projected actions. Initials SHALL reuse the player-panel avatar and seat color; no avatar art, identity fields, duration, round count or new in-room game action SHALL be added.

#### Scenario: Projected elimination summary
- **WHEN** an elimination or game-over surface is shown
- **THEN** projected reasons, times, standings and available actions SHALL be shown

### Requirement: Responsive game layout and navigation
The game screen SHALL keep existing in-game actions reachable and preserve their command and legality contracts. At 1024 px and above it SHALL place players on the left, the turn header, scaling board and journal with chat in the center, and My Turn and My Assets on the right. Side columns SHALL be approximately 240 px wide from 1024 to 1279 px and approximately 280 px from 1280 px. The centre SHALL contain the turn header, dice and last roll, and journal with chat.

#### Scenario: Desktop game screen
- **WHEN** the game is rendered at 1440×900
- **THEN** the top bar shows the product name “Economic Board Game”, correctly localized player count, connection status including reconnect state, and settings control, without a room label; the centre contains the turn header, dice and last roll, and journal with chat; and the turn header shows current player, phase, countdown and available dice

#### Scenario: Room label and round counter are omitted
- **WHEN** the top bar is rendered
- **THEN** it omits the room label and round counter, does not expose the join secret or internal room id, and does not require new projection fields

#### Scenario: Sound settings
- **WHEN** the settings control is opened
- **THEN** the existing volume and mute controls are available with their existing behavior and test identifiers

#### Scenario: Mobile game navigation
- **WHEN** the viewport is below 1024 px
- **THEN** the game SHALL offer bottom tabs for Board, Assets, Journal and More, with the board sized to the available width and resign, rules summary and leave accessible in More
- **AND** a server view update SHALL preserve the selected tab

#### Scenario: Leaving an active game
- **WHEN** an active player opens More
- **THEN** leaving for the lobby SHALL remain disabled with a reason until the view shows their elimination. Players who choose to leave SHALL use the existing resignation confirmation
- **AND** eliminated and non-playing viewers SHALL be able to return to the lobby

#### Scenario: Supported widths
- **WHEN** the game is rendered at widths 360, 390, 768, 1024, 1440 and 1920 px
- **THEN** the page SHALL have no horizontal overflow

### Requirement: Product name on every screen
The login, lobby, room and game headers, including the mobile game header, and the document title SHALL display “Economic Board Game”.

#### Scenario: Product name surfaces
- **WHEN** any application screen is rendered in either locale
- **THEN** each visible product heading and the document title SHALL display “Economic Board Game”

### Requirement: Opaque decision surfaces
Purchase and auction dialogs, sheets and status surfaces SHALL use a defined opaque surface token so board content cannot show through them.

#### Scenario: Decision surface overlays
- **WHEN** a purchase or auction surface overlays the board at a supported viewport
- **THEN** its background SHALL be opaque and the page SHALL not scroll to reach its controls

### Requirement: Temporary jail-attempt status
The order panel SHALL show the projected temporary-jail attempts used out of INTERIM_JAIL_RULE.maxAttempts. It SHALL use only attemptsUsed and SHALL NOT add jail actions or the out-of-scope final jail state.

#### Scenario: Temporary jail status
- **WHEN** the current projection marks a player in temporary jail
- **THEN** that player's order row SHALL show their current used attempts out of the configured maximum
### Requirement: Turn header contents
The turn header SHALL show the current player, phase, countdown and dice using the current projection; it SHALL NOT require new projection fields.

#### Scenario: Projected turn information
- **WHEN** a player views a turn header
- **THEN** the current player, phase, countdown and available dice match the current projection

### Requirement: Desktop viewport fit
At 1440×900 and 1920×1080, the board and decision controls SHALL fit without page scrolling, including the bottom row.

#### Scenario: Desktop decision viewport fit
- **WHEN** a purchase or auction decision is shown at 1440×900 or 1920×1080
- **THEN** the whole board and decision controls fit within the viewport without page scrolling

### Requirement: Desktop timing indicator
The desktop turn progress bar SHALL be omitted because the projection supplies a deadline but no turn duration; no duration estimate or new projection field SHALL be added.

#### Scenario: No duration estimate
- **WHEN** the game screen is rendered on desktop
- **THEN** the turn countdown may be shown, but a progress bar based on an estimated duration is not shown

### Requirement: Purchase card content
Purchase cards SHALL show category, group size, price, base rent, other group owners and the rent preview, using dark-on-light category and name text with WCAG AA contrast. They SHALL show current balance and, when affordable, exact balance after purchase. After purchase the projected balance SHALL be reduced by the fixed asset price per purchase-auction.ts:131-134; if unaffordable, omit the after amount and show the existing insufficient-funds reason on Buy.

#### Scenario: Affordable and unaffordable purchase
- **WHEN** the deciding player can afford the asset, or cannot afford its price
- **THEN** the current balance is shown in both cases; the after balance appears only when affordable, otherwise Buy shows the insufficient-funds reason

### Requirement: Auction panel content
Auction panels SHALL show current bid with start and step, leader, ordered response states, response timer bar, legal Raise and Pass actions, and the irrevocable-pass note from the current projection.

#### Scenario: Response queue changes
- **WHEN** the auction leader, responder, or passed players change
- **THEN** the ordered queue and each player's state SHALL match the current projection

### Requirement: Asset card content
Asset cards SHALL show category, projected rank when present, price and name in dark-on-light text with WCAG AA contrast; group chips with projected owners and houses; a rent schedule with the current projected tier and percent of price; house-cost and mortgage tiles; and existing owner actions in a two-column grid with each reason below its button. A mortgage term SHALL appear only when supplied by the projection.

#### Scenario: Owned asset details
- **WHEN** the viewer opens an owned asset
- **THEN** the current group member and rent tier are highlighted, and each available action retains its existing command and projected reason

### Requirement: Asset rent schedule headings
Asset-card rent schedules SHALL label house tiers as tiers and SHALL reserve the “Assets” heading for logistics and holdings schedules.

#### Scenario: House and holdings headings
- **WHEN** an asset rent schedule is rendered
- **THEN** house-based schedules use a tier heading and logistics or energy holdings schedules use the holdings heading

### Requirement: Board-centre caption during decision surfaces
While a purchase or auction decision surface is visible, the board-centre caption SHALL be hidden using the board display input so it never peeks beneath the surface.

#### Scenario: Purchase or auction decision caption
- **WHEN** a purchase or auction decision surface is visible
- **THEN** the board-centre caption SHALL be hidden using the board display input

### Requirement: Game-over action visibility
At 1440×900 the return-to-lobby action SHALL remain visible without scrolling, or the card body SHALL scroll with the action pinned visible.

#### Scenario: Game over at desktop height
- **WHEN** the game-over screen is rendered at 1440×900
- **THEN** the return-to-lobby action is visible in the viewport

## REMOVED Requirements
### Requirement: Responsive game layout
The game screen SHALL keep existing in-game actions reachable and preserve their command and legality contracts. At 1024 px and above it SHALL place players on the left, the turn header, scaling board and journal with chat in the center, and My Turn and My Assets on the right. Side columns SHALL be approximately 240 px wide from 1024 to 1279 px and approximately 280 px from 1280 px. The centre SHALL contain the turn header, dice and last roll, and journal with chat.

#### Scenario: Desktop game screen
- **WHEN** the game is rendered at 1440×900
- **THEN** the top bar shows the product name “Economic Board Game”, correctly localized player count, connection status including reconnect state, and settings control, without a room label; the centre contains the turn header, dice and last roll, and journal with chat; and the turn header shows current player, phase, countdown and available dice

#### Scenario: Room label and round counter are omitted
- **WHEN** the top bar is rendered
- **THEN** it omits the room label and round counter, does not expose the join secret or internal room id, and does not require new projection fields

#### Scenario: Sound settings
- **WHEN** the settings control is opened
- **THEN** the existing volume and mute controls are available with their existing behavior and test identifiers

#### Scenario: Desktop viewport fit
- **WHEN** the game is rendered at 1440×900 or 1920×1080, including a purchase or auction decision
- **THEN** the whole board and decision controls fit without page scrolling; a progress bar is omitted because the projection supplies a deadline but no turn duration, and no projection fields or duration estimate are added

#### Scenario: Mobile game navigation
- **WHEN** the viewport is below 1024 px
- **THEN** the game SHALL offer bottom tabs for Board, Assets, Journal and More, with the board sized to the available width and resign, rules summary and leave accessible in More
- **AND** a server view update SHALL preserve the selected tab

#### Scenario: Leaving an active game
- **WHEN** an active player opens More
- **THEN** leaving for the lobby SHALL remain disabled with a reason until the view shows their elimination. Players who choose to leave SHALL use the existing resignation confirmation
- **AND** eliminated and non-playing viewers SHALL be able to return to the lobby

#### Scenario: Supported widths
- **WHEN** the game is rendered at widths 360, 390, 768, 1024, 1440 and 1920 px
- **THEN** the page SHALL have no horizontal overflow
