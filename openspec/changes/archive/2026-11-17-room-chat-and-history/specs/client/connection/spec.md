## MODIFIED Requirements

### Requirement: Frames go through the protocol
Every received WebSocket message SHALL be decoded with `decodeServerFrame`;
a message that fails decoding SHALL be dropped and reported, never applied.
Every sent frame SHALL be a `Hello`, `Command` or `ChatSend` of `@game/protocol`.
A `ChatSend` SHALL be sent only while connected and SHALL NOT be resent after a reconnect.

#### Scenario: Malformed message
- **WHEN** the socket delivers text that is not a valid server frame
- **THEN** the held view SHALL NOT change and a connection problem SHALL be reported

#### Scenario: Chat is not resent
- **WHEN** the socket drops while a `ChatSend` waits for its `ChatAck` and a new `Welcome` arrives
- **THEN** the client SHALL send no `ChatSend` on the new socket
