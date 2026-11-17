## Context
Sources: `docs/efforts/visual-design.md` rev 2 C7; `docs/efforts/visual-design/design.md` § "Event log and chat"; handoff TASK-vd-chat rev 1. The room (`GameRoom`) is a serial executor; the connection (`GameConnection`) handles one frame at a time and sends `Welcome` in the same synchronous step as it subscribes.

## Decisions

### Chat runs on the room queue
`Room.chat(authorId, text)` is queued on the same promise chain as `submit`, so commands and chat of one room are handled one at a time in arrival order. Steps: room live, author is in `state.players` (eliminated players stay there; lobby leavers do not), `checkChatText`, rate limit, assign `seq`, `store.appendChat`, emit `{ kind: 'chat', message }` to subscribers, resolve `{ ok: true }`. The connection sends `ChatAck` only after the promise resolves, so every connection (including the sender's) has received `Chat` first. A failed write resolves `PERSISTENCE_FAILED`, emits nothing and forgets the cached next `seq` (re-read from `max(seq)` next time).

`seq` = `max(seq) + 1` per room, read lazily on the first chat after load and cached. `at` is the server clock at handling time (epoch ms), stored as `created_at`.

### Text rules (shared in `@game/protocol`)
`checkChatText(raw)` returns the trimmed text or a reason:
- `EMPTY`: nothing left after `String.prototype.trim`;
- `TOO_LONG`: more than 300 Unicode code points;
- `CONTROL_CHARACTER`: any `\p{Cc}` except `\n` (so `\r` and tab are rejected), or a lone surrogate (not storable as UTF-8 unchanged);
- `TOO_MANY_LINES`: more than 4 lines (`\n` count > 3).
The trimmed text is stored and broadcast. The frame schema itself only bounds `text` to 4096 UTF-16 units (a technical bound, like other ids); longer input is `MALFORMED_FRAME`.

### Rate limit
Per room and author, in memory (resets on restart, acceptable for a spam guard). Only accepted messages count. `TOO_FAST` when the previous accepted message is less than 500 ms old; `RATE_LIMITED` when 5 accepted messages lie within the last 10 s. Member and text checks run first, so a malformed message never consumes the budget.

### Reject reasons
`NOT_A_MEMBER`, `EMPTY`, `TOO_LONG`, `CONTROL_CHARACTER`, `TOO_MANY_LINES`, `TOO_FAST`, `RATE_LIMITED`, `ROOM_UNAVAILABLE`, `PERSISTENCE_FAILED`, exported as `CHAT_REJECT_REASONS`. A socket can only reach `ready` as a member and is closed when it leaves, so `NOT_A_MEMBER` is a defence for the room API; a non-member's `Hello` is still refused with `NOT_A_PARTICIPANT`.

### Welcome history
`Room.attach(listener)` runs on the room queue: it reads the last 200 `game_log` entries with `revision <= committed.revision` and the last 200 chat rows, subscribes the listener and returns `{ state, entries, chat }` in that same step. Nothing commits while it runs, so every later commit or chat message reaches the listener and none is also in the history. The connection projects the entries' events with the same function the `Update` path uses (`projectEvents`, injectable in `ConnectionDeps` for tests only) and returns them in log order as `history.entries: [{ revision, at, events }]` (`at` is the entry's transition time `LogEntry.now`, epoch ms, the same clock as chat `at`), dropping entries whose projected events are empty, so the feed can interleave events and chat by time (chat messages carry `at` and `seq`); `history.chat` is ascending by `seq`. History is always full (independent of `lastRevision`). A finished room loads on demand and serves its history; a restart reads the same rows.

If the history read fails the socket gets `Error ROOM_UNAVAILABLE` and closes; the client reconnects.

### Storage
Migration `0007_chat.sql`: `chat_messages(room_id text REFERENCES rooms(id), seq integer CHECK (seq > 0), author_id text REFERENCES guests(id), text text CHECK (char_length(text) BETWEEN 1 AND 300), created_at timestamptz NOT NULL, PRIMARY KEY (room_id, seq))`. Chat is not in `game_log`, snapshots or replay.

### Client
- `shared/api` connection: `sendChat(text)` sends `ChatSend` with a new client id (returns null when disconnected); options `onWelcome(view, history)`, `onChat(message)`, `onChatAck(ack)`; the connection holds no chat state.
- `entities/chat`: `messages` sorted by `seq`, deduplicated by `seq`; `replace(history)` on Welcome, `receive(message)`; `outgoing` entries `{ clientMsgId, text, status: 'pending' | 'rejected', reason? }`; ack ok removes the entry, ack rejected marks it. On a new Welcome still-pending entries become `rejected` with local reason `CONNECTION_LOST` and are not resent automatically (a lost ack would otherwise duplicate the message); the history shows whether it landed.
- `entities/event`: `entries` (`{ revision, at, events }` in order); `replace(history.entries)` on every Welcome, `append(entry)` on Update with the Update's revision and the client receive time as `at` (the Update frame carries no commit time; the protocol is unchanged there). No animation queue involvement: the animation path stays Update-only.
- `features/send-chat`: `sendChat(text)` checks `checkChatText` locally (a rejected outgoing entry with the reason, nothing sent), then sends and records `pending`.

## Risks
- A resent message after `CONNECTION_LOST` can duplicate one that landed; the user sees both in history. Idempotent `clientMsgId` would need a stored column; out of scope.
- 200 log entries can hold many events (an auction or liquidation); size is bounded by the frame limit of the server send path only. Event payloads are small; 200 entries stay well under 1 MB.
