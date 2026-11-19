## MODIFIED Requirements

### Requirement: Action buttons follow the view
`RollForOrder` SHALL require setup and the viewer as `setup.playerId`. `RollDice` SHALL require playing, the viewer as turn owner and `rolled: false`; `EndTurn` SHALL require playing, the viewer as turn owner and `rolled: true`. RollDice and EndTurn SHALL be disabled during auctions. Buttons SHALL be disabled while disconnected, while their command type is pending, and once the server deadline has passed. The turn panel SHALL show only actions belonging to the current phase. The currently applicable primary action SHALL be visually primary. An unavailable action belonging to the current phase SHALL remain visible, disabled, with its reason; actions exclusive to another phase SHALL be hidden.

#### Scenario: Before and after the roll
- **WHEN** it is the viewer's regular turn before the roll, then after the roll
- **THEN** only the applicable action is enabled and primary, any unavailable regular-turn action remains disabled with its reason, and the setup-only order roll is hidden

#### Scenario: My order roll
- **WHEN** the phase is setup and setup.playerId is the viewer
- **THEN** only the setup flow's RollForOrder action is shown as applicable and regular-turn actions are hidden

#### Scenario: Not my turn
- **WHEN** the view's turn.playerId is another player
- **THEN** RollDice and EndTurn SHALL be disabled

#### Scenario: Pending command
- **WHEN** the viewer pressed RollDice and its Ack has not arrived
- **THEN** RollDice SHALL be disabled

#### Scenario: Auction in progress
- **WHEN** the turn owner views an ongoing auction
- **THEN** RollDice and EndTurn SHALL be disabled

### Requirement: Responsive game layout
The game screen SHALL keep existing in-game actions reachable and preserve their command and legality contracts. At 1024 px and above it SHALL place players on the left, the turn header, scaling board and journal in the center, and My Turn and My Assets on the right. The centre SHALL contain the turn header, dice and last roll, and journal with chat. Side columns SHALL be approximately 240 px wide from 1024 to 1279 px and approximately 280 px from 1280 px. The turn header SHALL show current player, phase, countdown and available dice. A desktop top bar SHALL show the product name “Economic Board Game”, correctly localized player count, connection status (including reconnect state), and a settings control. It SHALL omit the room label entirely and omit the round counter; this effort SHALL NOT add projection fields. Sound controls SHALL be available behind the settings control. The whole board, including the bottom row, SHALL fit at 1440×900 without page scrolling.

#### Scenario: Desktop game screen
- **WHEN** the game is rendered at 1440×900
- **THEN** the top bar shows the product name, localized player count, connection status and settings control, without a room label; the centre contains the turn header, dice, journal and chat; and the entire board is visible without page scrolling

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

## ADDED Requirements

### Requirement: Board-centre phase caption
The board-centre caption SHALL describe the current projected game phase: turn-order roll, regular roll, purchase decision, auction, rent or debt, and game over. It SHALL update when the projected phase changes and SHALL NOT retain a caption from a prior phase.

#### Scenario: Auction caption
- **WHEN** the projection contains an active auction
- **THEN** the board-centre caption describes the auction rather than a turn-order or dice roll

#### Scenario: Finished game caption
- **WHEN** the projection phase is finished
- **THEN** the board-centre caption describes the completed game
