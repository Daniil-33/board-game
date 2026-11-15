# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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
