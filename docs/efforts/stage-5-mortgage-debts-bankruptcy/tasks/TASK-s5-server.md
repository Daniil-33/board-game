# Team Lead -> Engineer Task Handoff

```yaml
id: TASK-s5-server
revision: 1
effort: EFF-stage-5-mortgage-debts-bankruptcy
project: economic-board-game
source_commit: TBD # main after TASK-s5-core-debts merges
owner: team-lead
status: proposed
```

## Outcome

The protocol and server run `core-7` games end to end:
- the protocol accepts `Mortgage` and `Redeem` commands;
- stored stage 4 games are closed;
- finished games persist their result in `game_results`;
- restart and reload preserve mortgages and finished games;
- test-only fixtures can start the stage 5 browser scenarios.

## Acceptance criteria

Product (handoff revision 2, C12, C14 and C11 results; design § "Protocol",
§ "Server"):

1. **Protocol.**
   - `PROTOCOL_VERSION = 5`.
   - `Mortgage` and `Redeem` take payload `{ assetId: string }`, validated
     exactly like `BuildHouse` (no extra keys, bounded length).
   - The view stays `Type.Unsafe<StateView>`.
2. **Migration `0006`:**
   - closes every `lobby`/`playing` room (logs are kept);
   - creates `game_results`: `room_id` PK/FK, `rules_version`,
     `winner_id`, `finished_at`, `final_revision`, `eliminations jsonb`,
     `final_balances jsonb`, `created_at`.
3. **Results.**
   - An accepted command whose events include `GameEnded` inserts the
     `game_results` row in the **same transaction** as the log append and
     snapshot (persist before broadcast).
   - The room is marked finished.
   - A failure rolls back everything, and nothing is broadcast.
4. **Recovery and reload.**
   - Restart restores `mortgages` (`pending`, `lapsCompleted`) from the
     snapshot and log, and the next boundary behaves identically.
   - A finished room still loads and serves its final view, with `result`,
     to reconnecting players.
5. **Test-only fixtures** (the existing loader, `NODE_ENV=test` and
   `E2E_FIXTURES=1` only) gain named stage 5 builders, built with core
   helpers and passing the invariants:
   - a mortgage one lap from expiry;
   - a payer about to owe rent that requires each liquidation tier;
   - a payer who will go bankrupt to a player creditor;
   - two active players left, one about to go bankrupt;
   - mortgages in place for the restart scenario.

   The e2e task may extend them.

Technical proof:

6. Integration tests (real Postgres) over sockets with 3 guests:
   - mortgage and redeem, with the views on every guest;
   - a rejection with its code;
   - expiry at the boundary;
   - liquidation events and balances on every guest;
   - bankruptcy, with the creditor's partial payment and freed assets;
   - game end, with the `game_results` row contents;
   - restart with mortgages;
   - restart and reload of a finished room;
   - migration `0006` on a database holding a stage 4 room.
7. Protocol decoder tests for the new commands, including payload
   rejections.

## Scope and non-goals

In scope:
- `packages/protocol/**`;
- `apps/server/**`, migrations and the test fixtures;
- the OpenSpec change (protocol and server deltas);
- type-forced client placeholders only where the build breaks (as in
  stages 3-4, reported).

Not in scope:
- core rules (a defect goes to the Team Lead);
- client UI;
- Playwright;
- deploy changes.

## Canonical references

- `docs/efforts/stage-5-mortgage-debts-bankruptcy.md` revision 2.
- `docs/efforts/stage-5-mortgage-debts-bankruptcy/design.md`
  § "Versions", "Protocol", "Server", "Projection".
- `docs/efforts/stage-4-rent-building/design.md` § "Server" (fixtures).
- `openspec/specs/server/*`, `openspec/specs/protocol/*`.

## Constraints

- Persist before broadcast.
- One room per process.
- Commands are sequential.
- Fixtures are never reachable unless both flags are set.
- No credentials in Git.

## Dependencies

Starts after `TASK-s5-core-debts` merges. It runs in parallel with
`TASK-s5-client`; the server merges first, then the client rebases.

## Delegated decisions

Table and index details beyond the schema above, the fixture names, the
module split and the test helpers. Return to the Team Lead before changing
the result semantics or the transaction boundary.

## Required workflow

Explore -> Propose (OpenSpec change; `agentctl engineer report --wake`) ->
Team Lead approval -> Apply in a fresh context -> Verify -> PR -> start the
independent review yourself -> review fixes. Archive the OpenSpec change in
the PR once review passes.

## Required checks

- `pnpm build`, `pnpm test`, `pnpm test:integration`;
- `openspec validate --all --strict`;
- `git diff --check <base> HEAD` over the committed range (not the working
  tree).;
- green CI on the PR head (all jobs).

## Escalation conditions

- A core defect.
- A missing view field.
- A transaction or recovery conflict.
- A migration risk to staging data beyond closing rooms.

## Deliverables

- the OpenSpec change, code and tests;
- branch `agent/task-s5-server`, the PR and CI evidence;
- the independent review report;
- residual risks.

The Engineer accepts the exact revision before editing. A material change
creates a new revision.
