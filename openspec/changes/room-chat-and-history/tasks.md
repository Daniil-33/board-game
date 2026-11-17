## 1. Protocol (protocol/frames)
- [x] 1.1 `PROTOCOL_VERSION = 6`; `ChatSend`, `Chat`, `ChatAck` schemas and checkers; `Welcome.history`
- [x] 1.2 `checkChatText`, `CHAT_LIMITS`, `CHAT_REJECT_REASONS`
- [x] 1.3 Decoder and text rule tests

## 2. Server (server/chat, server/persistence)
- [x] 2.1 Migration 0007 and schema types; store `appendChat`, `lastChatSeq`, `recentChat`, `recentEntries`
- [x] 2.2 `Room.chat` on the room queue with member, text, rate-limit checks; `chat` room event
- [x] 2.3 `Room.attach` history step; connection Welcome history, `ChatSend` handling, `Chat` broadcast, `ChatAck`
- [x] 2.4 Integration: 3 guests, eliminated author, non-member, each reason, persist before broadcast, history after reload and restart, projection hiding

## 3. Client (client/chat)
- [x] 3.1 Connection glue for chat frames and Welcome history
- [x] 3.2 `entities/chat`, `entities/event`, `features/send-chat`; wiring in client-session
- [x] 3.3 Store and connection tests; lint boundaries

## 4. Verify
- [ ] 4.1 build, test, test:integration, client lint, openspec strict, diff check, CI green
