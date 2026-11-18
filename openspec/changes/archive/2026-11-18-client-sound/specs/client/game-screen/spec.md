## ADDED Requirements

### Requirement: Live game events trigger sounds
The game screen SHALL map live Update events to sound ids with ownership rules
from the accepted visual-design sound profile. Welcome history SHALL be silent.

#### Scenario: Live update versus reconnect history
- **WHEN** a live Update contains a mapped event, or Welcome contains the same event as history
- **THEN** only the live Update SHALL trigger sound

### Requirement: Live chat and animation trigger sounds
Incoming chat from another player SHALL play chat sound; own chat SHALL not.
Auction response timers SHALL tick only in their final three seconds and at
most once per second. Token steps SHALL sound during movement unless reduced
motion is requested.

#### Scenario: Other player's chat
- **WHEN** a new chat message arrives from another player
- **THEN** the client SHALL play the attenuated chat sound
- **AND** own messages and Welcome history SHALL remain silent

#### Scenario: Auction response countdown
- **WHEN** an auction response timer enters its final three seconds
- **THEN** it SHALL tick at most once for each remaining second

#### Scenario: Reduced motion
- **WHEN** movement runs with reduced motion enabled
- **THEN** token-step sound SHALL be skipped

### Requirement: Accessible sound controls
Translated mute and volume controls SHALL be keyboard accessible in the desktop
game header and the mobile “Ещё” panel.

#### Scenario: Desktop and mobile controls
- **WHEN** the game screen is used at desktop or mobile width
- **THEN** translated mute and volume controls SHALL be available in the appropriate location and operable by keyboard
