## ADDED Requirements

### Requirement: Chat store
`entities/chat` SHALL hold the room's chat messages ordered by `seq` without duplicates, replaced from `Welcome.history.chat` and extended by `Chat` frames, and the viewer's outgoing messages with status `pending` or `rejected` and a reason. No UI is part of this requirement.

#### Scenario: Duplicate and out-of-order delivery
- **WHEN** messages with `seq` 2, 1 and 2 arrive
- **THEN** the store SHALL hold exactly 1 and 2 in that order

#### Scenario: Acknowledgement
- **WHEN** a `ChatAck` for a pending message arrives
- **THEN** with `ok: true` the outgoing entry SHALL be removed, with `ok: false` it SHALL be marked `rejected` with the reason

#### Scenario: Reconnect
- **WHEN** a new `Welcome` arrives while a message is pending
- **THEN** that entry SHALL become `rejected` with reason `CONNECTION_LOST` and SHALL NOT be resent

### Requirement: Send chat action
`features/send-chat` SHALL check the text with `checkChatText`, record a rejected outgoing entry without sending when it fails or when the connection is down, and otherwise send `ChatSend` with a new `clientMsgId` and record it as pending.

#### Scenario: Invalid text
- **WHEN** the text is empty after trimming
- **THEN** no frame SHALL be sent and the outgoing entry SHALL be rejected with `EMPTY`

### Requirement: Event log store
`entities/event` SHALL hold the viewer's log entries `{ revision, at, events }` in order: replaced by `Welcome.history.entries` on every `Welcome` and extended by one entry per `Update` that carries events. Loading the history SHALL NOT queue animations.

#### Scenario: Reload
- **WHEN** a `Welcome` with history entries arrives
- **THEN** the event store SHALL hold exactly those entries and no animation step SHALL be queued
