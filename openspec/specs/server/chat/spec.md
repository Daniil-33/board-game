# server/chat Specification

## Purpose
Defines room chat on the game socket (validation, rate limit, persistence
before broadcast) and the `Welcome` history of recent log entries and chat
messages served to each viewer.

## Requirements

### Requirement: Room chat
A `ChatSend` frame from a ready socket SHALL be handled on the room's serial queue together with commands. The room SHALL accept it only from a current room member (a player in the room's state, including eliminated players) whose trimmed text passes `checkChatText`. Each rejection SHALL be answered `ChatAck { ok: false, reason }` and SHALL NOT be stored or broadcast. Chat SHALL stay outside the core, its log, snapshots and replay.

#### Scenario: Message reaches every guest
- **WHEN** one of three connected guests sends a valid `ChatSend`
- **THEN** every guest SHALL receive `Chat` with the same `seq`, author, trimmed text and time, and the sender SHALL then receive `ChatAck { ok: true }`

#### Scenario: Eliminated player writes
- **WHEN** a player who resigned and is still connected sends a valid message
- **THEN** it SHALL be accepted and broadcast

#### Scenario: Non-member
- **WHEN** a guest who is not a member opens the room, or the room receives chat from an author who is not a member
- **THEN** the socket SHALL be refused with `NOT_A_PARTICIPANT`, and the room SHALL reject the message with `NOT_A_MEMBER`

### Requirement: Chat rate limit
The room SHALL accept at most 5 messages per author in any 10 s and none within 500 ms of the author's previous accepted message. Only accepted messages SHALL count.

#### Scenario: Rate limit
- **WHEN** an author sends a second message within 500 ms, or a sixth message within 10 s
- **THEN** it SHALL be rejected with `TOO_FAST`, respectively `RATE_LIMITED`

### Requirement: Chat persists before broadcast
The room SHALL assign `seq` as one more than the room's highest stored `seq`, persist the message, then emit `Chat` to every connection of the room, then answer `ChatAck { ok: true }`. A failed write SHALL be answered `PERSISTENCE_FAILED` and SHALL emit nothing.

#### Scenario: Write failure
- **WHEN** the chat write fails
- **THEN** no connection SHALL receive `Chat` and the sender SHALL receive `ChatAck { ok: false, reason: 'PERSISTENCE_FAILED' }`

#### Scenario: Stored before seen
- **WHEN** any connection receives `Chat { seq }`
- **THEN** the `chat_messages` row with that `seq` SHALL already be committed

### Requirement: Welcome history
`Welcome.history.entries` SHALL hold, in log order, the room's last 200 log entries up to the Welcome revision as `{ revision, at, events }`, where `at` is the entry's transition time (`LogEntry.now`) and `events` are filtered for the viewer by the event projection the `Update` path uses; entries whose filtered events are empty SHALL be dropped. `Welcome.history.chat` SHALL hold the last 200 chat messages by ascending `seq`. History SHALL be served after a restart and for finished rooms.

#### Scenario: Reload
- **WHEN** a guest reconnects after chat and moves
- **THEN** its `Welcome` SHALL carry those log entries with their revisions and times, and those messages

#### Scenario: Restart
- **WHEN** the server restarts and a guest reconnects
- **THEN** the `Welcome` history SHALL equal what the guest would have received before the restart

### Requirement: History is consistent with later frames
History and the socket's subscription SHALL be taken in one step of the room's queue, so every later change arrives as `Update` or `Chat` and none is also in the history.

#### Scenario: Concurrent chat
- **WHEN** a message is accepted while another guest's `Hello` is being answered
- **THEN** that guest SHALL see it exactly once, either in `history.chat` or as a `Chat` frame

### Requirement: History follows the event projection
History events SHALL be filtered by the same per-viewer projection function as `Update` events.

#### Scenario: Projection hides events
- **WHEN** the event projection hides an event type from a viewer
- **THEN** that viewer's `Welcome.history.entries` SHALL NOT contain it, as its `Update` events do not, and an entry left with no events SHALL be omitted
