## ADDED Requirements

### Requirement: Responsive guest entry
The guest entry screen SHALL show the nickname form, guidance and errors in Russian and fit phone widths from 360 to 430 px without horizontal scrolling.

#### Scenario: Invalid nickname
- **WHEN** a guest submits an invalid nickname on a phone
- **THEN** the form and Russian validation message SHALL remain visible without requiring horizontal scrolling

### Requirement: Lobby room actions and capacity
The lobby SHALL show each room's occupancy out of six and its availability, including play in progress and code requirements. Room creation SHALL use a dialog with an optional access code. The profile placeholder SHALL be disabled and have a visible reason.

#### Scenario: Join a locked room
- **WHEN** a guest chooses «Войти по коду»
- **THEN** the guest SHALL be able to select a listed locked lobby room with space, enter its code and submit the selected room ID with the code
- **AND** a rejected code SHALL leave the error visible and allow correction

#### Scenario: Create on a phone
- **WHEN** a guest opens room creation on a phone 360 to 430 px wide
- **THEN** the form SHALL appear in a bottom sheet with an optional code and fit without horizontal scrolling
- **AND** keyboard dismissal SHALL return focus to the opener

### Requirement: Waiting room seats and controls
The waiting room SHALL display occupied and empty seats out of six with colored player markers and a creator label. A visible copy action SHALL be keyboard accessible, and successful copying SHALL announce confirmation. When Start is disabled for the creator, a reason SHALL be visible.

#### Scenario: Creator sees a locked room invite
- **WHEN** the creating client has the code and invite link returned by creation
- **THEN** it SHALL display both and offer copying
- **AND** if clipboard access fails, the link SHALL remain selectable and a failure message SHALL be shown

#### Scenario: Creator attempts to leave
- **WHEN** the creator chooses Leave in the waiting room
- **THEN** a confirmation SHALL explain that leaving closes the room and SHALL require confirmation before sending the request
- **AND** cancellation or Esc SHALL keep the guest in the room

#### Scenario: Waiting room on a phone
- **WHEN** the waiting room is displayed at 360 to 430 px
- **THEN** seats, invite details when available and room actions SHALL be reachable without horizontal scrolling
