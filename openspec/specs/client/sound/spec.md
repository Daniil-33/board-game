# client/sound Specification

## Purpose

Defines the client sound engine, asset loading, settings, ownership filtering, and reserved sound slots for interface feedback.

## Requirements

### Requirement: Playback starts after a user gesture
The always-loaded shell SHALL create or resume one Web Audio context after the
first pointerdown or keydown interaction. The lazily loaded sound engine SHALL
adopt that context when the game screen loads. Sound requests before the first
gesture SHALL be dropped. Sound requests received while the game screen chunk
is loading MAY be dropped and SHALL NOT be queued for later playback.

#### Scenario: First interaction
- **WHEN** a sound is requested before interaction and then after interaction
- **THEN** only the later request SHALL play

#### Scenario: Sound event during game-screen loading
- **WHEN** a sound event arrives after game entry but before the lazy sound engine attaches
- **THEN** the request MAY be dropped and SHALL NOT play later from a queue

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
