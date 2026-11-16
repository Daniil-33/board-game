# Team Lead -> Engineer Task Handoff

```yaml
id: TASK-s2-server
revision: 1
effort: EFF-stage-2-field-money
project: economic-board-game
source_commit: <main after TASK-s2-core merges; set at delivery>
owner: team-lead
status: proposed
```

## Outcome

`packages/protocol` speaks protocol version 2 carrying the stage 2 view
(board, economy, balances) and events, and `apps/server` runs `core-4` games
end to end: new games get a generated board and starting balances, the state
survives restart, and stage 1 games are closed by migration.

## Acceptance criteria

Product (effort handoff criteria 10 and 12):

1. `PROTOCOL_VERSION = 2`; a version 1 `Hello` is rejected with
   `PROTOCOL_VERSION_UNSUPPORTED`. `Welcome` and `Update` views carry
   `board`, `economy` and `balances`; `Update.events` carry `BoardGenerated`
   and `BalanceChanged`.
2. Migration `0003` sets `status = 'closed'` on every room in `lobby` or
   `playing` (stage 1 rules `core-3` are no longer runnable). Stage 1 logs are
   not modified. Opening any `core-3` game yields a failed room /
   `ROOM_UNAVAILABLE`, never a process crash; boot `restoreAll` reports it as
   failed and continues.
3. Server restart and client reconnect keep the generated board, economy and
   balances identical (deep equality of the projected view before and after).

Technical proof:

4. Protocol tests: a stage 2 view fixture decodes; version 1 rejected.
5. Server integration tests (real Postgres): two- and three-guest games show
   the same board to every guest and balances equal to `C(N)`; two created
   games differ in composition; a seeded game where a move crosses start
   credits the reward in every guest's `Update`; restart mid-game preserves
   board/economy/balances; migration `0003` on a DB holding stage 1 rooms
   closes them and a `core-3` log loads as a failed room.
6. Existing server suites updated for `core-4` (including any stage 1 seeded
   expectations that change with the new RNG stream).

## Scope and non-goals

In scope: `packages/protocol/**`, `apps/server/**` (migrations, tests,
fixtures), OpenSpec deltas for protocol and server.

Not in scope: game-core rule changes (return to the Team Lead), client UI
(`TASK-s2-client`), Playwright scenarios and Compose seeds (`TASK-s2-e2e`),
stage 1 deferred items (rate limits, token lifetime, in-memory finished
rooms, WS ping).

## Canonical references

- `docs/efforts/stage-2-field-money.md` revision 1.
- `docs/efforts/stage-2-field-money/design.md` § "Protocol", § "Server",
  § "Delegated decisions" (stage 1 stored games).
- `docs/efforts/stage-1-skeleton/design.md` § "Server" (write order,
  recovery).
- `openspec/specs/protocol/*`, `openspec/specs/server/*`.

## Constraints and invariants

Server authoritative; write order core -> persist -> broadcast; recovery from
snapshot plus log tail; one room per process, commands sequential; bind
`127.0.0.1`. No rules logic in the server.

## Dependencies

Starts after `TASK-s2-core` merges. Runs in parallel with `TASK-s2-client`;
the client consumes `PROTOCOL_VERSION` from this package, so publish the
version bump in the first commit and keep the frame shapes otherwise
unchanged. Shared files with the client task: none expected; report any.

## Delegated decisions

Test fixtures and helpers, migration file naming, how the seeded crossing
game is found (search a seed in the test). Return to the Team Lead before
changing frame shapes or the stored-game decision.

## Required workflow

Explore -> Propose (OpenSpec change, proposal checkpoint reported with
`agentctl engineer report --wake`) -> Team Lead approval -> Apply -> Verify ->
PR -> Review fixes. Archive the OpenSpec change in the PR once review passes.

## Required checks

`pnpm build`, `pnpm test`, `pnpm test:integration` (Postgres), migration on a
DB seeded with stage 1 rooms, `openspec validate --all --strict`,
`git diff --check`, green CI on the PR head.

## Escalation conditions

A needed core change; a protocol shape change beyond the version bump and
view contents; recovery that cannot prove equality; a migration that would
need to delete data.

## Deliverables

OpenSpec change, code and tests, branch `agent/task-s2-server`, PR, CI
evidence, independent review report, residual risks.

The Engineer accepts the exact revision before editing. A material change
creates a new revision.
