## MODIFIED Requirements

### Requirement: Rejected house command reasons
Rejected `BuildHouse` and `SellHouse` acknowledgements SHALL show their client-translated action title and mapped reason. Other rejected commands SHALL show their command title and a translated reason when available. Visible rejection copy SHALL NOT contain protocol codes or server-provided messages. Unknown codes SHALL use the translated retry prompt. The code SHALL remain available in the message element's `data-code` attribute.

#### Scenario: Illegal build rejected
- **WHEN** the server rejects `BuildHouse` with `UNEVEN_BUILD`
- **THEN** the HUD SHALL show the build title and translated uneven-build reason, without the code or server message, and the view SHALL stay as last projected

#### Scenario: Shared code on another command
- **WHEN** the server rejects `BuyAsset` or `Bid` with `INSUFFICIENT_FUNDS`
- **THEN** the HUD SHALL show that command's title and translated reason without the code, server message, or a house reason

### Requirement: Command rejection and reconnect feedback
Rejected game commands SHALL show a client-translated action title and translated reason in toasts and HUD messages. They SHALL NOT show protocol codes or server-provided message strings in visible text. When the code has no translated reason, the client SHALL show the action title and a translated retry prompt. The code SHALL remain available in `data-code` for diagnostics. The reconnect banner and offline HUD status SHALL show that the game continues and timers keep running, in the active locale.

#### Scenario: Multiple rejections
- **WHEN** more than three command rejections arrive in quick succession
- **THEN** at most three toasts SHALL be shown at once

#### Scenario: Recovery
- **WHEN** a disconnected game session receives its next Welcome
- **THEN** the reconnect banner SHALL disappear

#### Scenario: Rejected build
- **WHEN** a `BuildHouse` command is rejected with `BUILD_QUOTA_USED`
- **THEN** the toast and HUD message SHALL show “Нельзя построить дом” and the translated reason
- **AND** neither SHALL show the code or server message
- **AND** the message element SHALL retain `data-code="BUILD_QUOTA_USED"`

#### Scenario: Unknown rejection reason
- **WHEN** a client command is rejected with an unknown code
- **THEN** the client SHALL show the translated title for that command and a translated retry prompt without displaying the code or server message

#### Scenario: Reconnect status
- **WHEN** the client is disconnected and reconnecting
- **THEN** the banner and offline HUD status SHALL include the localized equivalent of “Партия продолжается, таймеры идут”
