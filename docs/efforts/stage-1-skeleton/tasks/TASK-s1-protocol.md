# Team Lead -> Engineer Task Handoff

```yaml
id: TASK-s1-protocol
revision: 1
effort: EFF-stage-1-skeleton
project: economic-board-game
source_commit: 5a05807 # rebase on main after TASK-s1-ci merges
owner: team-lead
status: proposed
```

## Outcome

New workspace package `packages/protocol` (`@game/protocol`): TypeBox schemas
and inferred types for every client/server message of stage 1, shared by
server and client, with a protocol version and error codes.

## Acceptance criteria

1. `PROTOCOL_VERSION = 1` exported.
2. WebSocket frames (JSON, tagged by `t`): client `Hello { protocolVersion,
   token, gameId, lastRevision | null }`, `Command { commandId, type,
   expected, payload }`; server `Welcome { protocolVersion, playerId, revision,
   view }`, `Ack { commandId, outcome, revision, error? }`, `Update { revision,
   view, events }`, `Error { code, message }`.
3. Client frames carry no `actor` field; schemas reject unknown properties.
4. Error code union: `PROTOCOL_VERSION_UNSUPPORTED`, `UNAUTHENTICATED`,
   `NOT_A_PARTICIPANT`, `MALFORMED_FRAME`, `ROOM_UNAVAILABLE`, plus engine
   error codes passed through as strings.
5. HTTP lobby schemas: guest login (nickname -> `{ guestId, token }`), create
   room, list joinable rooms, join room, start game (creator only). Nickname
   constraints are technical (length 1-24, trimmed, printable); no other
   product rules.
6. `decodeClientFrame(raw: string)` / `decodeServerFrame(raw: string)` return a
   typed frame or a `MALFORMED_FRAME` error; never throw on hostile input.
7. `view` and `events` are typed from `@game/game-core` exports (`StateView`,
   `GameEvent`); command payload schemas cover stage 1 commands
   (`RollForOrder`, `RollDice`, `EndTurn`) once their names are relayed from
   `TASK-s1-core-turns`; until then `type` is a string literal union stub
   that the Team Lead confirms before merge.
8. Interim-jail fields are marked temporary in schema `description`.
9. Tests: round-trip of every frame, rejection of malformed/extra fields,
   rejection of client `actor`, fuzz-ish table of hostile strings.

## Scope and non-goals

In scope: `packages/protocol/**`, workspace wiring (`pnpm-workspace.yaml` if
needed, `tsconfig` references), lockfile update for `@sinclair/typebox`.

Not in scope: transport code, Fastify routes, client networking, delta sync,
reconnect logic (server task), anything in `game-core` beyond type imports.

## Canonical references

- `docs/efforts/stage-1-skeleton.md` criterion 8.
- `docs/efforts/stage-1-skeleton/design.md` § "Protocol".
- `ROADMAP.md` § "Технические решения", stage 1 "Протокол".

## Constraints and invariants

Server is authoritative; clients send intents only. The package has no I/O and
no runtime dependency other than TypeBox and game-core types.

## Dependencies

After `TASK-s1-ci`. Parallel with `TASK-s1-core-turns`; coordinate command
names through the Team Lead, not by editing game-core.

## Delegated decisions

File layout, helper names, TypeBox compiler vs `Value` checks, test layout.
Return to the Team Lead for any new message type or field not listed.

## Required workflow

Explore -> Propose (OpenSpec change, report proposal with `--wake`) -> Team
Lead approval -> Apply (same context allowed: small, contract-only package) ->
Verify -> PR -> Review fixes.

## Required checks

`pnpm install --frozen-lockfile` after the lockfile update, `pnpm build`,
`pnpm test`, green CI on the PR head, `git diff --check`.

## Escalation conditions

A message needs product semantics not in the handoff (for example lobby rules
beyond create/list/join/start); conflict with core type exports.

## Deliverables

Package, tests, OpenSpec change, branch `agent/task-s1-protocol`, PR, CI
evidence, independent review report, residual risks.

The Engineer accepts the exact revision before editing. A material change
creates a new revision.
