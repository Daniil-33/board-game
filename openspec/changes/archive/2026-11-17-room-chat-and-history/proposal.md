## Why
The visual-design effort (C7, owner decision: chat in the MVP, inside the log) needs room chat and an event log that survive a reload. The feed widget comes later (`TASK-vd-game-layout`); this change delivers the protocol, server and client data layer (TASK-vd-chat PR 2).

## What Changes
- Protocol v6: client `ChatSend { clientMsgId, text }`; server `Chat { message: { seq, authorId, text, at } }` and `ChatAck { clientMsgId, ok, reason? }`; `Welcome` gains `history: { entries, chat }`, where `entries` are `{ revision, at, events }` log entries so a feed can interleave events and chat by time. Shared chat text rules (`checkChatText`, limits, reason codes) live in `@game/protocol`.
- Server: a room-level chat handled on the room's serial queue, after commands already queued. Member check, text validation, rate limit (5 per 10 s, 500 ms minimum interval), persist to `chat_messages` (migration `0007`), broadcast `Chat` to every connection of the room, then `ChatAck ok`.
- `Welcome.history`: the last 200 log entries as `{ revision, at, events }` with events projected for the viewer (entries left empty dropped) and the last 200 chat messages, read with the subscription in one serialized room step so nothing is lost or duplicated between history and later frames. Works after a restart and for finished rooms.
- Client data layer: `entities/chat` (messages by `seq`, deduplicated, plus outgoing state), `entities/event` (event log of `{ revision, at, events }` entries replaced from `history.entries` on every `Welcome`, appended from `Update`, no animation), `features/send-chat`, and connection glue in `shared/api`.

Out of scope: chat and feed UI, event-to-text mapping (`TASK-vd-game-layout`), moderation beyond length and rate limits, any game-core change. Chat never enters the core, its log or replay. No GAME-BREAKDOWN.md rule is touched: chat is not a game rule (effort `docs/efforts/visual-design.md` C7, design § "Event log and chat").

## Capabilities
### New Capabilities
- `server/chat`: room chat, its validation, rate limit, ordering and the Welcome history.
- `client/chat`: chat and event-log stores and the send-chat action.

### Modified Capabilities
- `protocol/frames`: version 6, chat frames, Welcome history.
- `server/persistence`: `chat_messages` table, migration 0007.

## Impact
`packages/protocol`, `apps/server` (rooms, ws, db, migration 0007), `apps/client` (`entities/chat`, `entities/event`, `features/send-chat`, `shared/api`, client-session wiring). Old clients (v5) are refused with `PROTOCOL_VERSION_UNSUPPORTED` and reload, as on earlier version bumps.
