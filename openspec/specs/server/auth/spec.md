# server/auth Specification

## Purpose
Defines guest login and how every lobby request and game socket identifies
its guest.

## Requirements

### Requirement: Guest login
`POST /api/guests { nickname }` SHALL create a guest with a server-generated
`guestId` and a fresh token from a CSPRNG, and SHALL answer 201
`{ guestId, token }`. The `guestId` SHALL be the core `playerId` of that
guest in every game. A nickname that fails the protocol nickname rule SHALL
be rejected with 400 `INVALID_REQUEST`.

#### Scenario: Login
- **WHEN** a client posts `{ nickname: 'bob' }`
- **THEN** the response SHALL match `GuestLoginResponseSchema` and a `guests` row with that id and nickname SHALL exist

#### Scenario: Two logins
- **WHEN** the same nickname logs in twice
- **THEN** the two responses SHALL carry different guest ids and different tokens

### Requirement: Tokens are stored only as hashes
The server SHALL store only a hash of each token and SHALL NOT write a token
to the database or the log in plain text.

#### Scenario: No plain token at rest
- **WHEN** a guest has logged in
- **THEN** no column of `guests` SHALL contain the token, and the captured server log SHALL not contain it

### Requirement: Bearer authentication
Every lobby route except guest login SHALL require `authorization: Bearer
<token>`. A missing or malformed header, or a token whose hash matches no
guest, SHALL be answered 401 `UNAUTHENTICATED`. The authenticated guest SHALL
be the only source of the acting player for every lobby operation and game
command.

#### Scenario: Unknown token
- **WHEN** a lobby request carries a well-formed token that was never issued
- **THEN** the response SHALL be 401 with code `UNAUTHENTICATED`
