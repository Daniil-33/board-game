# Team Lead -> Engineer Task Handoff

```yaml
id: TASK-s4-server
revision: 1
effort: EFF-stage-4-rent-building
project: economic-board-game
source_commit: TBD # main after TASK-s4-core merges; set on delivery
owner: team-lead
status: proposed
```

## Outcome

`packages/protocol` version 4 carries the stage 4 commands and view. In
`apps/server`, `core-6` games run with rent, building and selling over
sockets. Recovery keeps houses, quotas and an open rent settlement, and
stage 3 rooms are closed. A test-only fixture loader lets browser tests start
from a known game state.

## Acceptance criteria

1. `PROTOCOL_VERSION = 4`; a version 3 `Hello` is rejected.
   - `PayRent` has payload `null`.
   - `BuildHouse` and `SellHouse` have payload `{ assetId: string }`
     (bounded length, no extra keys).
   - Other payloads are rejected by the decoder.
2. Rent, build and sell commands from the turn owner are accepted and
   broadcast. Rejections return the core's specific error code in the `Ack`.
   - A stale or duplicate command never applies twice (existing guard
     semantics).
3. Auto-payment at the turn deadline works through the existing deadline
   arming, including after a restart (an overdue deadline fires on boot).
4. Restart and reconnect with an open settlement, with houses, and with a
   used build quota preserve the state exactly.
5. Migration `0005` sets `status = 'closed'` on every `lobby`/`playing`
   room. Logs are untouched, and closed rooms keep answering `ROOM_CLOSED`.
6. Test-only fixtures: the fixture loader is enabled only with
   `NODE_ENV=test` and `E2E_FIXTURES=1`. Startup fails with the variable
   name if `E2E_FIXTURES=1` is set without `NODE_ENV=test`.
   - It creates a room for given guest tokens from a named fixture state.
   - It validates the state with core invariants.
   - It persists the state as the room's genesis snapshot under `core-6`.
   - The loader's request and fixture format are documented for the e2e
     task. Fixture builders may live in a test-only module importable by
     `e2e/`.
   - Production and staging never enable it; this is covered by a test.

Technical proof:

7. Protocol tests for the new commands (accepted and rejected payloads).
8. Real-Postgres integration tests:
   - rent over sockets, with payer and owner balances seen by 3 guests;
   - auto-payment at the deadline on the fake clock;
   - build, then an illegal build rejected with its code, then sell;
   - restart with an open settlement and after a build;
   - the migration upgrade;
   - fixture loader accepted in test mode and refused otherwise.

## Scope and non-goals

In scope: `packages/protocol/**`, `apps/server/**`, OpenSpec deltas for
protocol and server.

Not in scope:
- core rule changes (return to the Team Lead);
- client UI;
- Playwright specs (e2e task);
- workflow changes.

## Canonical references

- `docs/efforts/stage-4-rent-building.md` revision 1.
- `docs/efforts/stage-4-rent-building/design.md` § "Protocol", § "Server".
- `docs/efforts/stage-3-purchase-auction/design.md` § "Server" (the
  stored-game policy).
- `openspec/specs/protocol/*`, `openspec/specs/server/*`,
  `openspec/specs/deployment/*`.

## Constraints and invariants

- The server is authoritative; the actor comes from the session.
- Core -> persist -> broadcast; sequential room commands.
- Recovery is from the snapshot plus the tail.
- No rules logic in the server.
- Test hooks are refused outside `NODE_ENV=test`.

## Dependencies

Starts after `TASK-s4-core` merges, in parallel with `TASK-s4-client`. Do
not edit client files. The server merges first; the client rebases.

## Delegated decisions

Fixture format and endpoint shape, migration file name, test helpers.

Return to the Team Lead before changing frame shapes or the stored-game
policy, or before adding any non-test endpoint.

## Required workflow

Explore -> Propose (OpenSpec change, `agentctl engineer report --wake`) ->
Team Lead approval -> Apply -> Verify -> PR -> start the independent review
yourself -> review fixes. Archive the OpenSpec change in the PR once review
passes.

## Required checks

- `pnpm build`, `pnpm test`, `pnpm test:integration`;
- the migration upgrade test;
- `openspec validate --all --strict`;
- `git diff --check`;
- green CI (all jobs).

## Escalation conditions

- A needed core change.
- A protocol change beyond the version, commands and view.
- Recovery that cannot prove equality.
- Any fixture path that could be reached in production.

## Deliverables

- the OpenSpec change, code and tests;
- branch `agent/task-s4-server`, the PR and CI evidence;
- the independent review report;
- residual risks.

The Engineer accepts the exact revision before editing. A material change
creates a new revision.
