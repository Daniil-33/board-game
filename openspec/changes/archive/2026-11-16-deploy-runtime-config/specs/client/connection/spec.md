## ADDED Requirements

### Requirement: Runtime API origin
The client SHALL use the API origin loaded from `/config.js` for REST requests and `/ws` connections. HTTPS SHALL map to WSS and HTTP to WS. Empty or absent configuration SHALL retain relative REST URLs and sockets on the page host. Authentication SHALL continue using tokens without cookies.

#### Scenario: Separate HTTPS host
- **WHEN** the page uses runtime API origin `https://stage-api.focusima.space`
- **THEN** REST SHALL target that origin and sockets SHALL target `wss://stage-api.focusima.space/ws`

#### Scenario: HTTP host
- **WHEN** runtime API origin is `http://localhost:8787`
- **THEN** REST SHALL target that origin and sockets SHALL target `ws://localhost:8787/ws`

#### Scenario: Default URLs
- **WHEN** runtime API origin is empty or absent
- **THEN** REST SHALL use existing relative API paths and sockets SHALL use the page host with WS or WSS according to its protocol

### Requirement: Client origin invites
Invite links SHALL resolve against the client page origin irrespective of the configured API origin.

#### Scenario: Separate API host invite
- **WHEN** a room is created from a client served on `https://stage.focusima.space` with a distinct API origin
- **THEN** its invite link SHALL use `https://stage.focusima.space` and retain the room and access code
