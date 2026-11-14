# Proposal

## Why

Stage 1 ("Сквозной скелет", ROADMAP.md) needs one wire contract that the room
server and the browser client both compile against. Without it each side
re-declares frames by hand and drifts. The effort handoff
(`docs/efforts/stage-1-skeleton.md`, criterion 8) and the Team Lead design
(`docs/efforts/stage-1-skeleton/design.md` § "Protocol") fix the message set;
this change turns it into a package. GAME-BREAKDOWN.md § "Принятые технические
границы и текущая реализация" requires an authoritative server where clients
send intents only; the protocol encodes that by never carrying an `actor` from
the client.

## What Changes

- New workspace package `packages/protocol` (`@game/protocol`), runtime
  dependency `@sinclair/typebox` only, type-only import of `@game/game-core`.
- `PROTOCOL_VERSION = 1`.
- TypeBox schemas and inferred types for the WebSocket frames, tagged by `t`:
  client `Hello`, `Command`; server `Welcome`, `Ack`, `Update`, `Error`.
  All object schemas are closed (`additionalProperties: false`); a client
  `actor` field is rejected.
- `ErrorCode`: protocol codes `PROTOCOL_VERSION_UNSUPPORTED`,
  `UNAUTHENTICATED`, `NOT_A_PARTICIPANT`, `MALFORMED_FRAME`,
  `ROOM_UNAVAILABLE`, plus engine error codes passed through as strings.
- `decodeClientFrame(raw)` / `decodeServerFrame(raw)`: total functions that
  return a typed frame or a `MALFORMED_FRAME` error and never throw.
- HTTP lobby request/response schemas: guest login, create room, list
  joinable rooms, join room, start game. Nickname rules are technical only
  (1-24 code points after trim, printable).
- Command `type` is the stub union `RollForOrder | RollDice | EndTurn`
  (names from the Team Lead design); payload schemas are confirmed against
  `TASK-s1-core-turns` by the Team Lead before merge.
- `view` / `events` are typed from game-core `StateView` / `GameEvent`.
  Interim-jail data is marked temporary in schema `description`.

## Capabilities

### New Capabilities

- `protocol/frames`: WebSocket frame set, protocol version, error codes,
  decoding of untrusted text.
- `protocol/lobby`: HTTP lobby request/response schemas and nickname rules.

## Impact

- New `packages/protocol/**`; `pnpm-lock.yaml` gains `@sinclair/typebox`.
- No change to `packages/game-core`, `apps/server`, `apps/client`.
- The root `build`/`test` scripts already iterate every workspace package,
  so CI covers the package without workflow changes.

## Out of Scope

- Transport code, Fastify routes and Ajv setup, client networking, delta
  sync and reconnect logic (server and client tasks).
- Any change to `packages/game-core`, including command and event names;
  those come from `TASK-s1-core-turns` through the Team Lead.
- Lobby product rules beyond create/list/join/start (room size limits are
  enforced by the core and the server, not encoded here).
- Final jail rules (stage 6), money, board layout (stage 2+).
