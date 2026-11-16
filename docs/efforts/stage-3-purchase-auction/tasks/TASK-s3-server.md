# Team Lead -> Engineer Task Handoff

```yaml
id: TASK-s3-server
revision: 1
effort: EFF-stage-3-purchase-auction
project: economic-board-game
source_commit: <main after TASK-s3-core merges; set at delivery>
owner: team-lead
status: proposed
```

## Outcome

`packages/protocol` version 3 carries the stage 3 commands and view, and
`apps/server` runs `core-5` games: non-owner auction commands over the
socket, response and paused-turn timers from state, recovery during a
decision or auction, and closure of stage 2 rooms.

## Acceptance criteria

Product (effort handoff C10, C13):

1. `PROTOCOL_VERSION = 3`; version 2 `Hello` rejected. `Command.type` accepts
   `BuyAsset`, `StartAuction`, `Bid`, `PassAuction`, all with payload `null`.
2. A non-turn-owner guest's `Bid`/`PassAuction` with the current
   `auctionResponse` target is accepted and broadcast to every guest; a stale
   or duplicate command is rejected without state change.
3. The 10 s response timer and the paused/resumed turn deadline are armed
   from `pendingDeadlines` after every transition and after restart.
4. Server restart and reconnect during a pending decision and during an
   auction preserve the state; an overdue response deadline fires on boot.
5. Migration `0004` sets `status = 'closed'` on every `lobby`/`playing` room;
   logs untouched; opening a `core-4` game follows the stage 2 failed-room
   path (closed rooms keep answering `ROOM_CLOSED`).

Technical proof:

6. Protocol tests for the new command types (null payload accepted, other
   payloads rejected).
7. Real-Postgres integration tests for 2-5, migration upgrade, and a full
   auction over sockets with three guests (bid, outbid, pass, AFK timeout,
   win; and unsold).

## Scope and non-goals

In scope: `packages/protocol/**`, `apps/server/**`, OpenSpec deltas for
protocol and server.

Not in scope: core rule changes (return to the Team Lead), client UI,
Playwright and Compose changes (e2e task), stage 1-2 deferred items.

## Canonical references

- `docs/efforts/stage-3-purchase-auction.md` revision 2.
- `docs/efforts/stage-3-purchase-auction/design.md` § "Protocol", § "Server".
- `docs/efforts/stage-2-field-money/design.md` § "Server" (stored-game policy).
- `openspec/specs/protocol/*`, `openspec/specs/server/*`.

## Constraints and invariants

Server authoritative; actor from the session; core -> persist -> broadcast;
sequential room commands; recovery from snapshot plus tail; bind 127.0.0.1;
no rules logic in the server.

## Dependencies

Starts after `TASK-s3-core` merges. Runs in parallel with `TASK-s3-client`.
Do not edit client files; whichever of server/client merges second rebases on
main (the client keeps its fixtures following `PROTOCOL_VERSION`).

## Delegated decisions

Test fixtures and helpers, migration file name, how the crossing/landing
seed is found in tests. Return to the Team Lead before changing frame shapes
or the stored-game policy.

## Required workflow

Explore -> Propose (OpenSpec change, proposal checkpoint reported with
`agentctl engineer report --wake`) -> Team Lead approval -> Apply -> Verify ->
PR -> Review fixes. Archive the OpenSpec change in the PR once review passes.

## Required checks

`pnpm build`, `pnpm test`, `pnpm test:integration`, migration upgrade test,
`openspec validate --all --strict`, `git diff --check`, green CI (both jobs).

## Escalation conditions

A needed core change; a protocol change beyond the version, command types and
view; recovery that cannot prove equality; a migration that would delete data.

## Deliverables

OpenSpec change, code and tests, branch `agent/task-s3-server`, PR, CI
evidence, independent review report, residual risks.

The Engineer accepts the exact revision before editing. A material change
creates a new revision.
