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
Toasts SHALL show a client-translated bold title above the translated reason; live announcement SHALL include both. HUD SHALL show title and reason on one line. HUD messages for commandless Error frames SHALL use “Ошибка сервера” / “Server error” and the mapped reason, otherwise retry copy. CTO decision (2026-11-19 ~07:08Z, option A): visible copy SHALL be localized title/reason only, never code or server message; codes remain in `data-code` and logs.

#### Scenario: Multiple rejections
- **WHEN** more than three command rejections arrive in quick succession
- **THEN** at most three toasts SHALL be shown at once

#### Scenario: Rejected build
- **WHEN** a `BuildHouse` command is rejected with `BUILD_QUOTA_USED`
- **THEN** the toast SHALL show “Нельзя построить дом” as its bold title and the translated reason below it, the HUD SHALL show both on one line
- **AND** neither SHALL show the code or server message
- **AND** the message element SHALL retain `data-code="BUILD_QUOTA_USED"`

#### Scenario: Unknown rejection reason
- **WHEN** a client command is rejected with an unknown code
- **THEN** the client SHALL show the translated title for that command and a translated retry prompt without displaying the code or server message

#### Scenario: Server Error frame
- **WHEN** the client receives an Error frame with a reason-mapped code and a server payload
- **THEN** the HUD SHALL show “Ошибка сервера” / “Server error” with the client-translated reason, without the code or server message

#### Scenario: Unknown server Error reason
- **WHEN** the client receives an Error frame whose code has no translated reason
- **THEN** the HUD SHALL show “Ошибка сервера” / “Server error” with the localized retry copy, without the code or server message

### Requirement: Purchase and auction intents
Purchase and auction controls SHALL send null-payload intents through the existing protocol connection. Purchase intents SHALL target the projected turn; Bid and PassAuction SHALL target the projected auction responseId. An Ack rejection SHALL show its client-translated title and reason without protocol codes or server-provided messages in visible text. The code SHALL remain available in `data-code` and diagnostic logs, and accepted Acks SHALL NOT locally change ownership or settle an auction.

#### Scenario: Rejected stale bid
- **WHEN** the server rejects a bid with an Ack error
- **THEN** the toast SHALL show the Bid title on a separate bold line and the translated reason below it, the HUD SHALL show both on one line, neither SHALL display the code or server message, the message element SHALL retain the code in `data-code`, and the client SHALL retain the latest projected auction

## ADDED Requirements

### Requirement: Reconnect status
The game SHALL announce reconnecting with a status banner until Welcome restores the session. Reconnect banner and offline HUD SHALL say in the active locale that the game and timers continue.

#### Scenario: Recovery
- **WHEN** a disconnected game session receives its next Welcome
- **THEN** the reconnect banner SHALL disappear

#### Scenario: Reconnect status
- **WHEN** the client is disconnected and reconnecting
- **THEN** the banner and offline HUD status SHALL include the localized equivalent of “Партия продолжается, таймеры идут”
