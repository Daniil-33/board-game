## MODIFIED Requirements

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
