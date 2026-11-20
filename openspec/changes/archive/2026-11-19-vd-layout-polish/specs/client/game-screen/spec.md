## ADDED Requirements

### Requirement: Desktop decision and debt surfaces remain visible
At 1440×900 and 1920×1080, active rent, liquidation, and bankruptcy surfaces SHALL be fully visible without page scrolling, together with the top bar and the board's bottom row. Rent SHALL visibly identify its payer. Only the latest debt notice not acknowledged by the viewer SHALL appear as an overlay. The viewer SHALL be able to dismiss it, and the next turn SHALL hide it automatically. Earlier debt notices SHALL remain readable in a non-overlay history list.

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

#### Scenario: Notice dismissal and next turn
- **WHEN** a viewer dismisses the latest debt notice or the next turn starts
- **THEN** its overlay SHALL disappear while the debt history remains readable without blocking the board

#### Scenario: Overflow-only keyboard stops
- **WHEN** a desktop side column's content fits its available height
- **THEN** its named region SHALL not add a keyboard tab stop; when it overflows, the region SHALL receive `tabindex="0"`

### Requirement: Temporary jail progress is visible
When the active turn owner is in temporary jail, every viewer's turn header SHALL show that player is in jail and the ordinal of the next release attempt out of `three-attempt jail limit`.

#### Scenario: Observer sees next jail attempt
- **WHEN** the active turn owner has a temporary jail entry
- **THEN** the turn header shows the next attempt and maximum attempt count to the jailed player and observers

### Requirement: Board caption does not overlap journal
At 1440×900 and 1920×1080, the board-center phase caption SHALL fit within the board interior and SHALL not intersect the journal panel. The board-interior journal SHALL keep its newest entry, including all text and its timestamp, fully visible inside the list's visible client area below the “Журнал” heading, without covering the dice/status area or board ring.

#### Scenario: Desktop caption and newest journal entry geometry
- **WHEN** the board is rendered at 1440×900 or 1920×1080 with a phase caption and a journal entry
- **THEN** the measured caption bounds fit within the board interior and do not intersect the journal, and the last journal entry's full box is inside the list's visible client rect with its top at or below the heading's bottom

### Requirement: Room display names contain no internal identifiers
Lobby room rows and waiting-room headings SHALL use “Room <creator nickname>” when the existing room payload includes the creator's nickname; otherwise they SHALL use a neutral “Room” label. They SHALL never display the internal room id or access code as a name.

#### Scenario: Creator nickname is available
- **WHEN** a listed or joined room contains its creator in the member list
- **THEN** the room name uses that creator's nickname

#### Scenario: Same creator in locked room options
- **WHEN** two locked rooms have the same creator nickname
- **THEN** each option includes its member names so the rooms remain distinguishable

#### Scenario: Creator nickname is unavailable
- **WHEN** a room does not contain its creator in the member list
- **THEN** the room name is neutral and contains neither its internal id nor access code

### Requirement: Elimination balance is labeled
An elimination dialog that shows the eliminated player's balance SHALL label the amount.

#### Scenario: Zero balance
- **WHEN** an eliminated player's balance is zero
- **THEN** the dialog shows a localized balance label followed by zero
