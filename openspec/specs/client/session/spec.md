# client/session Specification

## Purpose
Defines how the browser client identifies a guest, keeps that identity across
reloads, and lets the guest create, find, join and start a room.

## Requirements

### Requirement: Guest login
The login screen SHALL take a nickname, normalize it with the protocol's
`normalizeNickname`, and request a guest login with it. On success the client
SHALL store the guest id, token and nickname in `localStorage` and show the
lobby. An invalid nickname SHALL NOT be sent; a failed login SHALL show the
error and stay on the login screen.

#### Scenario: Successful login
- **WHEN** the user enters ` bob ` and submits
- **THEN** the client SHALL send `{ nickname: 'bob' }`, store the returned guest id and token, and show the lobby

#### Scenario: Invalid nickname
- **WHEN** the user submits an empty nickname or one longer than 24 code points
- **THEN** no request SHALL be sent and a validation message SHALL be shown

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

### Requirement: Lobby
The client SHALL render every returned room with its availability and members.
Open joinable rooms SHALL join with one click; locked lobby rooms with seats
SHALL ask for a code. In-play, full, finished and closed rooms SHALL NOT offer
joining. All HTTP responses SHALL pass their @game/protocol schemas. Optional
access codes SHALL use the protocol validator and SHALL never be logged.

#### Scenario: Mixed list
- **WHEN** open, locked and playing rooms are returned
- **THEN** their states are labelled, only the open room joins immediately,
  and only the locked room offers code entry

#### Scenario: Wrong code
- **WHEN** the server rejects a locked-room join with ACCESS_CODE_INVALID
- **THEN** the code-entry flow stays available and the error is shown

#### Scenario: Create room
- **WHEN** the guest presses Create
- **THEN** the client SHALL request create room and show the room view for the returned room

#### Scenario: Join room
- **WHEN** the guest presses Join on a listed room
- **THEN** the client SHALL request join for that room id and show the room view

#### Scenario: Malformed response
- **WHEN** a lobby response does not match its schema
- **THEN** the client SHALL show an error and SHALL NOT render the response

### Requirement: Room view
Members SHALL be named using authenticated get-room data, refreshed on Welcome
and PlayerAdded/PlayerLeftLobby updates. Only the creator SHALL see Start,
enabled with at least two members while connected and no lobby request pending.
Every member SHALL have Leave before start. Successful leave SHALL return to
lobby with a notice; failed leave SHALL show the error without pretending success.

#### Scenario: Late join and leave
- **WHEN** a new member joins and another leaves before start
- **THEN** get-room SHALL refresh the displayed names and the current roster

#### Scenario: Creator leaves
- **WHEN** the creator leaves and the server closes the room
- **THEN** every connected member SHALL return to lobby with a clear closure message

#### Scenario: Start disabled alone
- **WHEN** the creator is the only member
- **THEN** the Start button SHALL be visible and disabled

#### Scenario: Start enabled with two
- **WHEN** a second member has joined
- **THEN** the creator's Start button SHALL be enabled and the other member SHALL see no Start button

#### Scenario: Game starts
- **WHEN** the view's phase changes from `lobby` to `setup`
- **THEN** the client SHALL show the game screen

### Requirement: Creator access details and invite
Create SHALL accept an optional access code. Only the creating client's create
response SHALL supply the displayed code and copyable invite link. The client
SHALL use /?room=<id>&code=<code>, retaining the intended join through guest login.
Codes SHALL NOT be stored in localStorage. Clipboard failure SHALL leave a
selectable link. Consumed invite parameters SHALL be removed from the address bar.

#### Scenario: Invite after login
- **WHEN** a logged-out guest opens a valid invite and logs in
- **THEN** the client SHALL join that room with the link's code

#### Scenario: Existing session and invite failure
- **WHEN** a guest with a stored room opens an invite whose join fails
- **THEN** the invite SHALL take precedence over automatic old-room reconnect,
  and the client SHALL show the error with explicit retry or dismissal

### Requirement: Poll recovery
A successful room-list poll SHALL clear the preceding poll error. Late polls
SHALL NOT overwrite newer foreground operation errors or restore a departed room.

#### Scenario: Transient polling error
- **WHEN** a background poll fails and the next succeeds
- **THEN** the new list SHALL be displayed and the prior poll error cleared

### Requirement: Lookup lifetime
Room lookup responses SHALL apply only to the current room entry. A failed
lookup SHALL permit later refresh, including one triggered during an active request.

#### Scenario: Leave during lookup
- **WHEN** a lookup completes after the guest left its room
- **THEN** it SHALL NOT restore the departed room

### Requirement: Responsive guest entry
The guest entry screen SHALL show the nickname form, guidance and errors in Russian and fit phone widths from 360 to 430 px without horizontal scrolling.

#### Scenario: Invalid nickname
- **WHEN** a guest submits an invalid nickname on a phone
- **THEN** the form and Russian validation message SHALL remain visible without requiring horizontal scrolling

### Requirement: Lobby room actions and capacity
The lobby SHALL show each room's occupancy out of six and its availability, including play in progress and code requirements. Room creation SHALL use a dialog with an optional access code. The profile placeholder SHALL be disabled and have a visible reason.

#### Scenario: Join a locked room
- **WHEN** a guest chooses «Войти по коду»
- **THEN** the guest SHALL be able to select a listed locked lobby room with space, enter its code and submit the selected room ID with the code
- **AND** a rejected code SHALL leave the error visible and allow correction

#### Scenario: Create on a phone
- **WHEN** a guest opens room creation on a phone 360 to 430 px wide
- **THEN** the form SHALL appear in a bottom sheet with an optional code and fit without horizontal scrolling
- **AND** keyboard dismissal SHALL return focus to the opener

### Requirement: Waiting room seats and controls
The waiting room SHALL display occupied and empty seats out of six with colored player markers and a creator label. A visible copy action SHALL be keyboard accessible, and successful copying SHALL announce confirmation. When Start is disabled for the creator, a reason SHALL be visible.

#### Scenario: Creator sees a locked room invite
- **WHEN** the creating client has the code and invite link returned by creation
- **THEN** it SHALL display both and offer copying
- **AND** if clipboard access fails, the link SHALL remain selectable and a failure message SHALL be shown

#### Scenario: Creator attempts to leave
- **WHEN** the creator chooses Leave in the waiting room
- **THEN** a confirmation SHALL explain that leaving closes the room and SHALL require confirmation before sending the request
- **AND** cancellation or Esc SHALL keep the guest in the room

#### Scenario: Waiting room on a phone
- **WHEN** the waiting room is displayed at 360 to 430 px
- **THEN** seats, invite details when available and room actions SHALL be reachable without horizontal scrolling

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
