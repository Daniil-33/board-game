## ADDED Requirements

### Requirement: Playback starts after a user gesture
The client SHALL create one Web Audio context after the first pointer or
keyboard interaction. Sound requests before that gesture SHALL be dropped.

#### Scenario: First interaction
- **WHEN** a sound is requested before interaction and then after interaction
- **THEN** only the later request SHALL play

### Requirement: Sound assets load lazily
The client SHALL fetch and decode an MP3 buffer on first use and cache it for
later playback. Sound files SHALL be emitted as external hashed assets. Fetch,
decode and playback failures SHALL be silent and SHALL NOT throw.

#### Scenario: First use
- **WHEN** an available sound is requested for the first time after interaction
- **THEN** its buffer SHALL be fetched and decoded once
- **AND** later requests SHALL use the cached buffer

### Requirement: Persisted sound settings
Mute and volume SHALL be reactive and persisted per browser. If storage is
unavailable or invalid, the client SHALL retain usable default settings.

#### Scenario: Remembered controls
- **WHEN** mute or volume is changed and the page is reloaded
- **THEN** the setting SHALL be restored from browser storage

#### Scenario: Blocked storage
- **WHEN** browser storage is blocked
- **THEN** sound controls SHALL continue to work for the current page

### Requirement: Filter and attenuate other-player sounds
For another player's event, the client SHALL play only dice-roll, dice-double,
purchase, auction-win, bankrupt, victory and chat, at approximately nine
decibels below the configured volume.

#### Scenario: Other player's event
- **WHEN** an allowed other-player sound is requested
- **THEN** it plays at the lower gain
- **AND** every other sound id is filtered

### Requirement: Reserved sound slots
Casino, chance, jail and trade-offer SHALL be valid sound ids with no assets;
requesting one SHALL be a silent no-op.

#### Scenario: Reserved slot
- **WHEN** a reserved sound id is requested
- **THEN** no file SHALL be fetched and no sound SHALL play
