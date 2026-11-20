## ADDED Requirements

### Requirement: Desktop decision and debt surfaces remain visible
At 1440×900 and 1920×1080, active rent, liquidation, and bankruptcy surfaces SHALL be fully visible without page scrolling, together with the top bar and the board's bottom row. Rent SHALL visibly identify its payer. Debt notices SHALL remain visible during the notice lifetime.

#### Scenario: Rent shortfall on desktop
- **WHEN** a rent shortfall is active at either supported desktop viewport
- **THEN** the rent payer and complete rent card are visible without page scrolling, and the top bar and bottom board row remain visible

#### Scenario: Debt notice on desktop
- **WHEN** a liquidation or bankruptcy notice is active at either supported desktop viewport
- **THEN** the complete notice is visible without page scrolling, and the top bar and bottom board row remain visible

### Requirement: Desktop side columns stay within the viewport
At desktop widths, the controls column SHALL be constrained below the top bar. The My Assets region SHALL scroll internally when its contents exceed the available height, remain keyboard-focusable, and retain a visible scrollbar styled with existing tokens. The Players column SHALL use the same containment when its roster exceeds the available height. Mobile layout SHALL remain unchanged.

#### Scenario: Long assets beside a debt notice
- **WHEN** a liquidation fixture has more assets than fit in the desktop side column
- **THEN** the page SHALL not scroll, the My Assets region SHALL scroll internally and be keyboard-focusable, and the complete debt notice, top bar, and board bottom row SHALL remain visible

### Requirement: Temporary jail progress is visible
When the active turn owner is in temporary jail, every viewer's turn header SHALL show that player is in jail and the ordinal of the next release attempt out of `INTERIM_JAIL_RULE.maxAttempts`.

#### Scenario: Observer sees next jail attempt
- **WHEN** the active turn owner has a temporary jail entry
- **THEN** the turn header shows the next attempt and maximum attempt count to the jailed player and observers

### Requirement: Board caption does not overlap journal
At 1440×900, the board-center phase caption SHALL not intersect the journal panel.

#### Scenario: Desktop caption and journal geometry
- **WHEN** the board is rendered with a phase caption at 1440×900
- **THEN** the caption bounds and journal bounds do not intersect

### Requirement: Room display names contain no internal identifiers
Lobby room rows and waiting-room headings SHALL use “Room <creator nickname>” when the existing room payload includes the creator's nickname; otherwise they SHALL use a neutral “Room” label. They SHALL never display the internal room id or access code as a name.

#### Scenario: Creator nickname is available
- **WHEN** a listed or joined room contains its creator in the member list
- **THEN** the room name uses that creator's nickname

#### Scenario: Creator nickname is unavailable
- **WHEN** a room does not contain its creator in the member list
- **THEN** the room name is neutral and contains neither its internal id nor access code

### Requirement: Elimination balance is labeled
An elimination dialog that shows the eliminated player's balance SHALL label the amount.

#### Scenario: Zero balance
- **WHEN** an eliminated player's balance is zero
- **THEN** the dialog shows a localized balance label followed by zero
