## ADDED Requirements

### Requirement: Responsive turn-order roll dialog
During setup the client SHALL present a dialog on desktop and a bottom sheet on phones. It SHALL show player avatars, dice, the current roller, the server deadline countdown and tie status from the authoritative view. The local roll action SHALL follow the existing setup command availability conditions.

#### Scenario: Tie re-roll and timeout
- **WHEN** the server view shows a tie or advances after an automatic deadline roll
- **THEN** the dialog SHALL show the updated dice, tie status, roller and countdown from that view
- **AND** when setup finishes the dialog SHALL close

#### Scenario: Keyboard dismissal during setup
- **WHEN** a keyboard user dismisses the setup dialog with Esc while setup is still active
- **THEN** focus SHALL return to an accessible way to reopen the dialog
- **AND** dismissal SHALL preserve the current setup state and deadline
