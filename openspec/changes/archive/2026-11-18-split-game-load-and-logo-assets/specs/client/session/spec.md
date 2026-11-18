## MODIFIED Requirements

### Requirement: Identity survives a reload
On start the client SHALL read the stored guest from `localStorage`. With a
stored guest it SHALL skip the login screen and use the stored token for
every lobby request and `Hello`. With a stored room id it SHALL reconnect to
that room. If the recovered server view is in setup or playing, the client
SHALL load and show the game screen after recovery completes.

#### Scenario: Reload in the lobby
- **WHEN** a logged-in guest reloads the page
- **THEN** the lobby SHALL be shown without a new guest login request

#### Scenario: Token rejected
- **WHEN** a lobby request or the socket answers `UNAUTHENTICATED`
- **THEN** the client SHALL clear the stored guest and show the login screen

#### Scenario: Reload directly into an active game
- **WHEN** a guest with a stored room reloads the game's direct URL and the server restores a setup or playing view
- **THEN** the client SHALL load and show the game screen with the recovered view

#### Scenario: Game screen chunk is unavailable after a redeploy
- **WHEN** loading the async game or game-over screen chunk fails
- **THEN** the client SHALL retry the import once
- **AND WHEN** the retry also fails
- **THEN** the client SHALL show a translated load error with a Reload button that calls `location.reload()`

## ADDED Requirements

### Requirement: Game screen code is deferred
The client SHALL keep game-screen presentation code and dependencies out of
the initial login, lobby, and waiting-room loads. This includes the board,
PixiJS, sound engine, game-only widgets, and game dialogs. When the session
enters setup or playing, the client SHALL load these dependencies through the
async game-screen boundary and show a loading state until the screen is ready.

#### Scenario: Login, lobby, and waiting room
- **WHEN** a guest loads login, lobby, or waiting-room screens
- **THEN** the browser SHALL NOT download PixiJS or game-screen presentation code

#### Scenario: Async game dependencies
- **WHEN** login, lobby, or waiting-room is shown
- **THEN** the browser SHALL NOT download board, PixiJS, sound engine, game-only widgets, or game dialogs

#### Scenario: Enter game
- **WHEN** the server view enters setup or playing
- **THEN** the client SHALL load the game-screen presentation and display the game after it is ready

#### Scenario: Reload directly into an active game
- **WHEN** a stored guest reloads while its room is in setup or playing
- **THEN** the client SHALL reconnect, load the async game-screen dependencies, and render the recovered authoritative view
