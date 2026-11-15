# Team Lead -> Engineer Task Handoff

```yaml
id: TASK-s1-server-api
revision: 2
effort: EFF-stage-1-skeleton
project: economic-board-game
source_commit: e30d40a # main with handoff rev 3 and server rooms (PR #15); rebase on TASK-s1-core-resign once merged
owner: team-lead
status: proposed
```

## Outcome

`apps/server` becomes a runnable Fastify service: guest login, the lobby HTTP
API (including access codes, leaving and room lookup) and the WebSocket game
endpoint on top of the room module (`apps/server/src/rooms`, PR #15), so real
browser clients can play stage 1 end to end, including resignation and game
end. `packages/protocol` gains the schemas these need.

## Acceptance criteria

Product (effort handoff rev 3, criteria 1, 1a-1c, 8, 9):

1. Guest login `POST /api/guests { nickname }` -> `{ guestId, token }`.
   The server stores only a hash of the token. The server generates
   `guestId`; it is also the core `playerId`.
2. Lobby (all require `Authorization: Bearer <token>`):
   - `POST /api/rooms { accessCode? }` creates a room (core `CreateGame`
     with a CSPRNG seed, creator added through `AddPlayer`). An access code
     is optional; the server stores only its hash; the creator's response
     includes the code and an invite link that carries it.
   - `GET /api/rooms` lists rooms per the CTO interpretation of 1a: rooms in
     lobby (joinable, or flagged locked when they have an access code) and
     rooms in play (flagged not joinable); finished and closed rooms hidden.
     A member's own rooms are always included (client review RVW-005).
   - `GET /api/rooms/:roomId` returns the room summary with members and
     nicknames to any member (client review RVW-005: late-joiner nicknames).
   - `POST /api/rooms/:roomId/join { accessCode? }` adds the caller while in
     lobby with seats left; a locked room requires the correct code.
   - `POST /api/rooms/:roomId/leave` before start removes the caller (core
     leave command from TASK-s1-core-resign). If the caller is the creator,
     the room closes: status `closed`, connected members get a final
     `Update`/close notice, the room disappears from the list.
   - `POST /api/rooms/:roomId/start` (creator only, at least two members).
3. WebSocket `GET /ws`: the first frame must be `Hello`; the server checks
   the protocol version, the token and room membership, then replies
   `Welcome`. `Hello` is accepted for rooms in lobby, in play and finished
   (to show the result). Lobby and game changes reach every connected member
   as `Update` with the projection and projected events.
4. `Command` frames: actor from the socket's guest; `Resign` is a client
   command (criterion 1c); `Ack` after persistence; duplicate `commandId`
   returns the original `Ack`. When the core reports the game ended, the
   room status becomes `finished` in the same transaction as the log entry.
5. A dropped socket is not resignation: reconnect with
   `Hello { lastRevision }` gets `Welcome`; an older socket for the same
   guest and room is closed.
6. The service listens on `127.0.0.1` by default; host, port and DB URL come
   from environment variables.

Technical proof:

7. Protocol additions in `packages/protocol`: access code and invite fields,
   `locked`/`joinable` flags and `finished`/`closed` statuses on the room
   summary, get-room and leave schemas, `Resign` in the client command union
   (name from TASK-s1-core-resign), error codes for a wrong or missing access
   code and a closed room. Ids and command ids reject code points Postgres
   cannot store (U+0000, lone surrogates; server-rooms RVW-001 remainder).
8. Nickname rule fix (protocol review RVW-007): at least one code point that
   is not U+200C/U+200D, no leading or trailing joiners; tests.
9. Fastify Ajv: `removeAdditional: false`, `coerceTypes: false`,
   `NICKNAME_FORMAT` registered (protocol review RVW-005).
10. Migration adding `finished` and `closed` to the room status constraint
    and an access-code hash column.
11. Integration tests (Postgres + real WebSocket clients): two and three
    guests through lobby, start, setup and turns; locked room with right and
    wrong code; leave before start; creator leaving closes the room; resign
    on own turn and on another's turn down to a winner; unknown property
    rejected; non-member `Hello` rejected; reconnect after a drop; server
    restart mid-game with clients reconnecting.

## Scope and non-goals

In scope: `apps/server/src/{http,ws,auth,lobby,main}` and tests, a new
migration, `packages/protocol` additions above with tests.

Not in scope: room executor internals beyond the status transitions above,
core rules (TASK-s1-core-resign), client UI (TASK-s1-client-lobby),
Dockerfiles/Compose and Playwright (TASK-s1-compose-e2e), accounts, rate
limiting, public exposure, a player who never reconnects (stage 8).

## Canonical references

- `docs/efforts/stage-1-skeleton.md` revision 3; CTO interpretation of 1a
  (TL inbox, 2026-11-15T07:56Z): lobby + in-play rooms listed, finished and
  closed hidden.
- `docs/efforts/stage-1-skeleton/design.md` § "Server", § "Protocol".
- `openspec/changes/server-rooms`, `protocol-stage-1-frames`,
  `client-stage-1-skeleton` (routes the client already calls).
- Core leave/resign/game-end contract from TASK-s1-core-resign's OpenSpec change.

## Constraints and invariants

Server is authoritative; the actor always comes from the authenticated
socket. Write order is owned by the room module. Access codes and tokens are
never stored or logged in plain text. Bind to localhost only.

## Dependencies

Explore and Propose may start now. Apply of anything that uses the core
leave/resign commands waits for TASK-s1-core-resign to merge; the Team Lead
relays its command names.

## Delegated decisions

Plugin layout, token and access-code formats, invite link format, connection
registry, error mapping. Return to the Team Lead for any new route or frame
field not listed.

## Required workflow

Explore -> Propose (OpenSpec change, report with `--wake`) -> Team Lead
approval -> Apply in a fresh context -> Verify -> PR -> Review fixes.

## Required checks

`pnpm build`, `pnpm test`, `pnpm test:integration` locally and in CI,
`git diff --check` over the range, a manual run with two clients.

## Escalation conditions

A lobby or resignation case not covered by revision 3; room module interface
insufficient; any product rule beyond the criteria above.

## Deliverables

Fastify service, protocol additions, migration, tests, OpenSpec change,
branch `agent/task-s1-server-api`, PR, CI evidence, independent review
report, residual risks.

## Revision history

- 1: initial.
- 2: effort handoff rev 3 (access code, leave, resign, game end), CTO list
  interpretation, get-room route (client RVW-005), id pattern (server-rooms
  RVW-001 remainder), protocol additions moved into this task.

The Engineer accepts the exact revision before editing. A material change
creates a new revision.
