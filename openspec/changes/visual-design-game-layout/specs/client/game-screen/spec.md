## MODIFIED Requirements

### Requirement: Public player balances
A player panel SHALL show each participant's nickname and avatar in projected seat color, projected balance via Money, house count, and applicable current-turn, in-debt and eliminated badges from the view. It SHALL label the current turn as paused on the roster and in the header when the projected turn is paused. Each new server view SHALL refresh balances, including lap rewards. The production client SHALL NOT calculate prices, capital or rewards.

#### Scenario: Lap reward update
- **WHEN** an Update supplies a new balance after a lap reward
- **THEN** the panel SHALL display the supplied balance immediately, independently of queued movement animation

#### Scenario: Eliminated participant remains visible
- **WHEN** an eliminated participant is absent from the active turn order
- **THEN** the panel SHALL retain their nickname, projected balance and eliminated mark

#### Scenario: Paused turn
- **WHEN** the active turn has a projected paused remaining time, including zero
- **THEN** the roster entry and turn header SHALL display a translated paused label

## ADDED Requirements

### Requirement: Responsive game layout
The game screen SHALL keep existing in-game actions reachable and preserve their command and legality contracts. At 1024 px and above it SHALL place players on the left, the turn header, scaling board and journal in the center, and My Turn and My Assets on the right. Side columns SHALL be approximately 240 px wide from 1024 to 1279 px and approximately 280 px from 1280 px. The turn header SHALL show current player, phase, countdown and available dice.

#### Scenario: Mobile game navigation
- **WHEN** the viewport is below 1024 px
- **THEN** the game SHALL offer bottom tabs for Board, Assets, Journal and More, with the board sized to the available width and resign, rules summary and leave accessible in More
- **AND** a server view update SHALL preserve the selected tab

#### Scenario: Supported widths
- **WHEN** the game is rendered at widths 360, 390, 768, 1024, 1440 and 1920 px
- **THEN** the page SHALL have no horizontal overflow

### Requirement: Turn and asset panels
My Turn SHALL distinguish its primary action from secondary and danger controls. My Assets SHALL group owned assets by color group and display group gradients, the dark-surface logo or monogram, house pips and mortgage status. Build, sell house, mortgage and redeem SHALL use existing legality adapters. Disabled controls SHALL expose their reasons by tooltip on desktop and visible text on mobile.

#### Scenario: Owned property controls
- **WHEN** an owned asset permits building, selling a house, mortgaging or redeeming
- **THEN** the corresponding control SHALL send the existing command
- **AND** unavailable controls SHALL explain why

### Requirement: Combined event journal and chat
The journal SHALL show only projected events and chat received through the existing room session, with translated event descriptions, icons, actors and amounts when supplied. Unknown events SHALL yield no journal row. The composer SHALL enforce the server text rules, including trimmed length of 1–300 characters and at most four lines, and display the translated ChatAck rejection reason. Room members SHALL be able to send regardless of elimination or spectator status.

#### Scenario: History and live delivery
- **WHEN** the journal receives Welcome history followed by live chat and updates
- **THEN** history SHALL be ordered by server timestamp and live entries SHALL appear in frame arrival order
- **AND** duplicate chat frames SHALL NOT add rows

#### Scenario: Reading earlier entries
- **WHEN** a live item arrives while the viewer is reading above the bottom
- **THEN** the journal SHALL preserve their scroll position
- **AND** live chat arriving while the mobile Journal tab is unread SHALL be indicated by a dot

### Requirement: Command rejection and reconnect feedback
Rejected game commands SHALL show translated reason toasts. The game SHALL announce reconnecting with a status banner until Welcome restores the session.

#### Scenario: Multiple rejections
- **WHEN** more than three command rejections arrive in quick succession
- **THEN** at most three toasts SHALL be shown at once

#### Scenario: Recovery
- **WHEN** a disconnected game session receives its next Welcome
- **THEN** the reconnect banner SHALL disappear
