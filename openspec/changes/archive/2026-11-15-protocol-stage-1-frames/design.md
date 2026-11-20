# Design

## Context

Requirements: `specs/`. Sources: effort handoff criterion 8, Team Lead design
§ "Protocol", task handoff `TASK-s1-protocol` revision 1.

game-core exports the types the protocol reuses: `StateView`, `GameEvent`,
`Expectation`, `TargetRef`, `CommandId`, `PlayerId`, `Revision`. The server
fills `actor`, `now` and `entropy`; the client sends only
`{ commandId, type, expected, payload }`.

## Decisions

### D1. TypeBox `TypeCompiler` for runtime checks

Schemas are compiled once at module load with `TypeCompiler.Compile` and
reused by the decoders. Same JSON Schema objects are exported so the server
can hand them to Fastify/Ajv.

### D2. Closed objects everywhere

Every `Type.Object` sets `additionalProperties: false`. This is what rejects a
client `actor`, `__proto__` keys and typos. Tests assert `actor` rejection
explicitly so a future "open" schema cannot slip through.

### D3. Decoders are total

`decodeClientFrame(raw: unknown)` and `decodeServerFrame(raw: unknown)`:

1. non-string or longer than `MAX_FRAME_LENGTH` (1 MiB of UTF-16 units) ->
   `MALFORMED_FRAME` without parsing;
2. `JSON.parse` inside `try` -> `MALFORMED_FRAME` on any throw (including
   `RangeError` from deep nesting);
3. compiled check -> `MALFORMED_FRAME` with the first error path in `message`.

Result type: `{ ok: true, frame } | { ok: false, error: { code: 'MALFORMED_FRAME', message } }`.
The returned frame is the parsed value (no defaults or coercion applied).

### D4. Branded ids via `Type.Unsafe`

`commandId`, `playerId`, `revision` are `Type.Unsafe<CommandId>(Type.String(...))`
etc., so decoded frames carry game-core brands without casts at call sites.
Technical bounds: ids are non-empty strings of at most 128 UTF-16 units;
revision is a non-negative safe integer; token at most 512 units; error
codes (protocol, lobby and passed-through engine codes) are 1-64 UTF-16
units.

### D5. `view` and `events` are shallow-checked, statically typed

`view` is `Type.Unsafe<StateView>(object)` and each event is
`Type.Unsafe<GameEvent>({ type: string, payload: unknown })`. The protocol
does not re-declare the state shape: the server is authoritative and
game-core owns `StateView`, which `TASK-s1-core-turns` is changing in
parallel. The client gets a compile-time type from game-core and a runtime
guarantee only that the frame envelope is well-formed. The `view` schema
`description` states that the interim-jail part of the view
(stage 1 interim rule, replaced in stage 6) is temporary; no protocol field
carries jail data of its own. The description does not name game-core
symbols: "Interim jail state in this view is temporary (stage 1 interim rule,
replaced in stage 6)." An event's `payload` is required; an event without
data carries `payload: null`.

### D6. Command type stub

`Command` is a union over `CLIENT_COMMAND_TYPES = ['RollForOrder', 'RollDice', 'EndTurn']`,
each with `payload: null`, pending the Team Lead relay of the final names and
payloads from `TASK-s1-core-turns`. `Timeout` and lifecycle commands are not
client-sendable and are absent.

### D7. Error codes

`ProtocolErrorCode` is the literal union of the five protocol codes. The wire
schema for `code` is `string` (engine codes pass through), and the static
type is `ProtocolErrorCode | (string & {})` so editors still complete known
codes.

### D8. Nickname check is one function

TypeBox (`string.length`, no `u` regex flag) and Ajv (code points, `u` flag)
disagree on astral characters, so the nickname is not expressed with
`minLength`/`maxLength`/`pattern`. The schema uses
`format: 'game-nickname'`; the package registers that format in TypeBox's
`FormatRegistry` and exports `NICKNAME_FORMAT = { name, validate }` for the
server to add to Ajv. `isValidNickname(s)`: no leading/trailing whitespace
(`s === s.trim()`), 1-24 code points, every code point printable: not
`\p{Cc}`, `\p{Cf}`, `\p{Cs}`, `\p{Co}`, `\p{Cn}`, `\p{Zl}`, `\p{Zp}`,
except that U+200C ZWNJ and U+200D ZWJ are allowed (emoji ZWJ sequences,
Persian and other scripts need them).
`normalizeNickname(s)` trims and returns the value or `null`, for the client.

### D9. Team Lead confirmations (Apply)

- Ack is a two-member union: `accepted` has no `error`, `rejected` requires
  one. Same fields as the handoff; the pairing removes an impossible state.
- Lobby: `RoomSummary { roomId, creatorId, status, members }`; create, join
  and start return `{ room }`, list returns `{ rooms }`; `roomId` is the
  `gameId` of `Hello`. No leave-room operation (open owner question).
- Lobby auth: `AuthHeadersSchema` requires `authorization: Bearer <token>`
  and is open, because real requests carry other headers. Error body is
  `ErrorBodySchema { code, message }`; `LOBBY_ERROR_CODES` adds
  `NOT_ROOM_CREATOR`, `INVALID_REQUEST`; the static `ErrorCode` type covers
  protocol and lobby codes plus any engine string.
- Token: 1-512 visible ASCII characters in both `Hello` and the header.
- `decodeClientFrame`/`decodeServerFrame` take `unknown` (a superset of the
  handoff's `string`) so a binary WebSocket message is rejected, not cast.
- Decoders dispatch on `t` through a `Map` (no prototype lookup) to the
  compiled schema of that frame, so error messages name the failing field.

## Risks / Trade-offs

- Shallow `view` check trusts the server's projection shape. Accepted:
  the server is authoritative and both sides compile against the same
  game-core type.
- Registering a TypeBox format is a module-level side effect (no I/O).
