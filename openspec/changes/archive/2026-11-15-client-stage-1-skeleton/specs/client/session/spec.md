# Spec Delta

## Purpose

Defines how the browser client identifies a guest, keeps that identity across
reloads, and lets the guest create, find, join and start a room.

## ADDED Requirements

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
that room.

#### Scenario: Reload in the lobby
- **WHEN** a logged-in guest reloads the page
- **THEN** the lobby SHALL be shown without a new guest login request

#### Scenario: Token rejected
- **WHEN** a lobby request or the socket answers `UNAUTHENTICATED`
- **THEN** the client SHALL clear the stored guest and show the login screen

### Requirement: Lobby
The lobby screen SHALL list joinable rooms with their members, and SHALL let
the guest create a room or join a listed room. Every lobby response SHALL be
checked against the matching `@game/protocol` schema before use. The client
SHALL NOT offer a leave-room control.

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
The room view SHALL show the room's members by nickname. Only the room
creator SHALL see a Start button, and it SHALL be enabled only when the room
has at least two members. When the game leaves phase `lobby` every member's
client SHALL show the game screen.

#### Scenario: Start disabled alone
- **WHEN** the creator is the only member
- **THEN** the Start button SHALL be visible and disabled

#### Scenario: Start enabled with two
- **WHEN** a second member has joined
- **THEN** the creator's Start button SHALL be enabled and the other member SHALL see no Start button

#### Scenario: Game starts
- **WHEN** the view's phase changes from `lobby` to `setup`
- **THEN** the client SHALL show the game screen
