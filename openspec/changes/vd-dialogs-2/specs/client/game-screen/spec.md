## MODIFIED Requirements

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

### Requirement: Responsive game layout
The game screen SHALL keep existing in-game actions reachable and preserve their command and legality contracts. At 1024 px and above it SHALL place players on the left, the turn header, scaling board and journal with chat in the center, and My Turn and My Assets on the right. Side columns SHALL be approximately 240 px wide from 1024 to 1279 px and approximately 280 px from 1280 px. The centre SHALL contain the turn header, dice and last roll, and journal with chat. The turn header SHALL show the current player, phase, countdown and available dice from the current projection; it SHALL NOT require new projection fields.

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
- **THEN** the whole board, decision controls and bottom row fit without page scrolling; a progress bar is omitted because the projection supplies a deadline but no turn duration, and no projection fields or duration estimate are added

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

### Requirement: Responsive decision and asset surfaces
Purchase response SHALL use a modal dialog on desktop or bottom sheet on mobile only for the decider; others SHALL see non-modal status. Auctions SHALL be inline on desktop. On mobile, only the current responder SHALL see a sheet; others SHALL see inline content, and it SHALL open when its viewer becomes responder. Decision surfaces SHALL use the current projection and legality adapters. Purchase cards SHALL show the group gradient, category, group size, price and base rent, other group owners, rent preview, the exact post-purchase balance when affordable, timeout note and existing actions. The post-purchase balance SHALL equal the projected balance minus the fixed asset price as specified by `purchase-auction.ts:131-134`; when unaffordable, the card SHALL omit a negative balance and show the existing insufficient-funds reason on Buy. Auctions SHALL show the current bid and leader, ordered response states, response timer bar, legal bid/pass actions and the irrevocable-pass note. Asset inspection SHALL use a responsive dialog on desktop and bottom sheet on mobile, with a group gradient header, owner and house markers, complete rent schedule with the projected current tier highlighted, house cost, mortgage terms, and existing controls with their mapped reasons.

#### Scenario: Purchase surface by viewport
- **WHEN** a projected purchase decision is visible on desktop or mobile
- **THEN** it SHALL show the group gradient header, logo URL or monogram fallback, asset name and price, rent-table preview, buy and start-auction actions with disabled reasons, and the projected response countdown in the appropriate responsive surface, and a timeout note describing the existing automatic auction behavior
- **AND** the deciding player SHALL not be able to dismiss the response surface before answering

#### Scenario: Auction surface by viewport
- **WHEN** a projected auction is visible on desktop or mobile
- **THEN** desktop SHALL show it inline in the centre column and mobile SHALL show a bottom sheet for the current responder and inline content for everyone else, with the asset, projected leading bid and leader in that player's seat color, the existing legal bid increments, pass action, response timer with a visible last-seconds state and progress bar, and irrevocable-pass note
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

### Requirement: Rent shortfall and debt resolution surfaces
The rent surface SHALL show payer, creditor, asset, amount due and a shortfall hint when current projected balance is below the projected rent amount. The missing amount SHALL be derived only from those projected values. It SHALL retain the existing PayRent and manage-assets actions and SHALL NOT add settlement actions. Debt notices SHALL show the automatic liquidation summary, including sold or mortgaged assets, steps and amounts supplied by the view. Clients SHALL NOT calculate settlement amounts from design examples.

#### Scenario: Rent with and without shortfall
- **WHEN** a rent view shows the payer's shortfall or sufficient funds
- **THEN** the panel SHALL show the projected amount and creditor and SHALL show the missing amount only in the shortfall case

#### Scenario: Liquidation summary
- **WHEN** a view contains liquidation steps
- **THEN** the summary SHALL list each sold or mortgaged asset and its projected amount

### Requirement: Elimination and game-over presentation
Elimination and game-over surfaces SHALL show the projected reason, final standings and balances, with the winner emphasized and existing leave or back-to-lobby actions. Player initials SHALL reuse the player panel initial avatar with seat color; no avatar artwork or identity fields SHALL be added. The client SHALL omit elapsed duration and round count, and SHALL NOT offer a new game in the room because those values and actions are absent from the projection and protocol. An eliminated player SHALL remain able to watch the game and use chat.

#### Scenario: Eliminated player keeps watching
- **WHEN** the viewer is eliminated while the game continues
- **THEN** the elimination screen SHALL be visible while current game state and chat remain available

#### Scenario: Game over standings
- **WHEN** the projected game is complete
- **THEN** the game-over screen SHALL show final standings from the view and provide a leave or back-to-lobby action

### Requirement: Board-centre phase caption
The board-centre caption SHALL describe the current projected game phase: turn-order roll, regular roll, purchase decision, auction, rent or debt, and game over. It SHALL update when the projected phase changes and SHALL NOT retain a caption from a prior phase. While a purchase status or auction decision surface is visible, the caption SHALL be hidden or repositioned so it never peeks out beneath the surface, using the board display input.

#### Scenario: Auction caption
- **WHEN** the projection contains an active auction
- **THEN** the board-centre caption describes the auction rather than a turn-order or dice roll

#### Scenario: Finished game caption
- **WHEN** the projection phase is finished
- **THEN** the board-centre caption describes the completed game

## ADDED Requirements

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
The order panel SHALL show the existing projected temporary-jail attempt count as a compact localized “In jail · n/3” status. It SHALL use only the projected attemptsUsed value and SHALL NOT add jail actions or implement the out-of-scope final jail state.

#### Scenario: Temporary jail status
- **WHEN** the current projection marks a player in temporary jail
- **THEN** that player's order row SHALL show their current used attempts out of three
