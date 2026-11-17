## MODIFIED Requirements

### Requirement: Protocol version
The package SHALL export `PROTOCOL_VERSION` equal to `6`. `Hello` and
`Welcome` SHALL carry the protocol version.

#### Scenario: Version constant
- **WHEN** `PROTOCOL_VERSION` is imported
- **THEN** it SHALL equal `6`

### Requirement: Frame set
Every WebSocket frame SHALL be a JSON object tagged by a string field `t` and SHALL conform to exactly one of the client or server frame shapes below.

#### Scenario: Frame shape contract
- **WHEN** this requirement is exercised
- **THEN** the following constraints SHALL hold:

Every WebSocket frame SHALL be a JSON object tagged by a string field `t`.
Client frames SHALL be exactly:
- `Hello { t, protocolVersion, token, gameId, lastRevision }` where
  `lastRevision` is a revision or `null`;
- `Command { t, commandId, type, expected, payload }` where `expected` is a
  game-core `Expectation` (`{ kind: 'revision', revision }` or
  `{ kind: 'target', target: { kind, id } }`);
- `ChatSend { t, clientMsgId, text }` where `clientMsgId` is an id string and
  `text` a string of at most 4096 UTF-16 units.

Server frames SHALL be exactly:
- `Welcome { t, protocolVersion, playerId, revision, view, history }` where
  `history` is `{ entries, chat }`, `entries` an array of
  `{ revision, at, events }` (`revision` a positive revision, `at` a
  non-negative integer timestamp, `events` an array of events) and `chat` an
  array of chat messages;
- `Ack { t, commandId, outcome, revision, error? }` with `outcome` one of
  `accepted`, `rejected`; `error { code, message }` SHALL be present exactly
  when `outcome` is `rejected`;
- `Update { t, revision, view, events }`;
- `Error { t, code, message }`;
- `Chat { t, message }` where a chat message is `{ seq, authorId, text, at }`
  with `seq` a positive integer, `authorId` a player id, `text` a string and
  `at` a non-negative integer timestamp;
- `ChatAck { t, clientMsgId, ok, reason? }` where `reason` SHALL be present
  exactly when `ok` is `false` and SHALL be one of `CHAT_REJECT_REASONS`.

#### Scenario: Round trip
- **WHEN** any valid frame of the set is serialized with `JSON.stringify` and decoded by the matching decoder
- **THEN** the decoder SHALL return the frame deep-equal to the original

#### Scenario: Wrong direction
- **WHEN** a server frame is passed to `decodeClientFrame`, or a client frame to `decodeServerFrame`
- **THEN** the decoder SHALL return a `MALFORMED_FRAME` error

## ADDED Requirements

### Requirement: Chat text rules
The package SHALL export `checkChatText(text)`, shared by server and client. It SHALL trim the text and return the trimmed text, or a reason: `EMPTY` when nothing remains, `TOO_LONG` above 300 Unicode code points, `CONTROL_CHARACTER` for any control character other than newline or for a lone surrogate, `TOO_MANY_LINES` above 4 lines. `CHAT_REJECT_REASONS` SHALL also list `NOT_A_MEMBER`, `TOO_FAST`, `RATE_LIMITED`, `ROOM_UNAVAILABLE` and `PERSISTENCE_FAILED`.

#### Scenario: Valid text is trimmed
- **WHEN** `checkChatText` receives `"  hi\nthere  "`
- **THEN** it SHALL return the text `"hi\nthere"`

#### Scenario: Each text reason
- **WHEN** it receives only spaces, 301 code points, a tab or carriage return, or five lines
- **THEN** it SHALL return `EMPTY`, `TOO_LONG`, `CONTROL_CHARACTER` and `TOO_MANY_LINES` respectively

#### Scenario: Rejected ChatAck needs a reason
- **WHEN** a `ChatAck` with `ok: false` and no `reason`, or `ok: true` with a `reason`, is decoded
- **THEN** `decodeServerFrame` SHALL return a `MALFORMED_FRAME` error
