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
- **THEN** RollDice and EndTurn SHALL be disabled and one visible reason line SHALL identify that player

#### Scenario: Pending command
- **WHEN** the viewer pressed RollDice and its Ack has not arrived
- **THEN** RollDice SHALL be disabled

#### Scenario: Auction in progress
- **WHEN** a player views an ongoing auction or purchase decision
- **THEN** regular-turn RollDice and EndTurn actions SHALL NOT be shown

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

## ADDED Requirements

### Requirement: Board-centre phase caption
The board-centre caption SHALL describe the current projected game phase: turn-order roll, regular roll, purchase decision, auction, rent or debt, and game over. It SHALL update when the projected phase changes and SHALL NOT retain a caption from a prior phase.

#### Scenario: Auction caption
- **WHEN** the projection contains an active auction
- **THEN** the board-centre caption describes the auction rather than a turn-order or dice roll

#### Scenario: Finished game caption
- **WHEN** the projection phase is finished
- **THEN** the board-centre caption describes the completed game
