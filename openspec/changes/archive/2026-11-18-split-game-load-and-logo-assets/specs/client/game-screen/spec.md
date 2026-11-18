## ADDED Requirements

### Requirement: Deferred game screen uses the recovered session

The asynchronously loaded game screen SHALL render the latest authoritative
view and preserve existing game controls, reconnect feedback, and direct-reload
behavior. Loading the game screen SHALL NOT require a protocol or server change.

#### Scenario: Session updates while game code loads
- **WHEN** the server sends a newer game view before the deferred game screen is ready
- **THEN** the game screen SHALL render the latest view when it becomes ready

#### Scenario: Reconnect after direct reload
- **WHEN** a direct reload restores an active room and the socket reconnects while game code is being loaded
- **THEN** the game screen SHALL show the restored projection and clear reconnect feedback after Welcome

#### Scenario: Preserve sound activation through lazy loading
- **WHEN** a player interacts with the page before entering a game
- **THEN** the lazy sound engine SHALL adopt the AudioContext created by the shell gesture gate without requiring another gesture
