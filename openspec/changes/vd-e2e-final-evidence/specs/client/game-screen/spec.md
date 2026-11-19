## MODIFIED Requirements

### Requirement: Decision surface accessibility
Every dialog and sheet SHALL trap focus, expose `aria-modal="true"`, return outside focus attempts to its content, and restore focus when dismissed. Escape SHALL dismiss only surfaces for which the viewer has no required rules response.

#### Scenario: Modal focus containment
- **WHEN** a dialog or sheet is open and a focus attempt targets content outside it
- **THEN** focus SHALL remain inside the open surface and the surface SHALL expose `aria-modal="true"`

#### Scenario: Escape policy
- **WHEN** Escape is pressed with an asset inspection surface or another dismissable surface open
- **THEN** that surface SHALL close and return focus to its opener
- **WHEN** Escape is pressed with a deciding player's purchase response, an active responder's auction sheet, rent payment or game-over open
- **THEN** that surface SHALL remain open
- **WHEN** a purchase decision belongs to another player or an auction response belongs to another player
- **THEN** the viewer SHALL receive no dialog or sheet for that decision and SHALL retain access to the underlying chat
