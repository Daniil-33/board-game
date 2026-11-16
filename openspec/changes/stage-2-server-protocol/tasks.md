# Tasks

## 1. Protocol version and projection

- [ ] 1.1 Implement protocol/frames “Protocol version” and “Stage 2 public projection and events”: export version 2, update the schema description and add typed board/economy/balance/event fixtures; verify package typecheck and protocol unit tests, then include the version bump in the first implementation commit.
- [ ] 1.2 Implement server/game-socket “Hello first” version compatibility evidence: update successful server Hello helpers/fixtures to use PROTOCOL_VERSION, retain an explicit version 1 rejection test, and verify socket integration tests reject version 1 with PROTOCOL_VERSION_UNSUPPORTED before authentication.

## 2. Stored game compatibility

- [ ] 2.1 Implement server/persistence “Stage 1 room retirement” in 0003_stage2_rules.sql; extend migration tests with a real 0002 database containing all statuses and old game data, verify exact closure and unchanged log/snapshot/member rows, re-run idempotence, and keep the 0001 -> 0002 test isolated to those migrations.
- [ ] 2.2 Implement server/recovery “Unsupported stored games fail safely”: add real-Postgres core-3 log-only and old-shaped snapshot coverage, preserve the existing failed-room load boundary (add an explicit supported-version guard only if required), and verify active boot reporting continues with a healthy core-4 room without rewriting old data.
- [ ] 2.3 Implement server/game-socket “Hello first” compatibility evidence without reordering the handshake; verify a migrated closed core-3 room returns ROOM_CLOSED, a finished core-3 room returns ROOM_UNAVAILABLE and direct manager.open on closed core-3 data registers a failed room. Verify no unsupported game timer or command runs and package typecheck passes.

## 3. Stage 2 network and recovery evidence

- [ ] 3.1 Implement server/game-socket “Stage 2 state reaches every guest” evidence in one stage 2 integration test module: start two- and three-guest games, compare all projected boards and exact C(N), verify two seeded games differ in composition and creation logs carry BoardGenerated; run against real Postgres.
- [ ] 3.2 Extend that module for server/game-socket “Start crossing”: find a bounded deterministic crossing sequence with actual core commands, drive it through authenticated sockets, and assert every guest receives the same persisted BalanceChanged lap-reward and credited balance; run the focused integration file.
- [ ] 3.3 Extend existing recovery tests for server/recovery “Stage 2 recovery equality”: restore from a snapshot plus nonempty tail including a crossing before shutdown, and compare board/economy/balances deeply; verify focused recovery integration tests.
- [ ] 3.4 Extend the stage 2 socket integration module for server/game-socket “Restart and reconnect”: clean restart mid-game, reconnect all guests with lastRevision and compare projected board/economy/balances deeply; run the focused file and document any changed server compatibility contract in apps/server/README.md.

## 4. Integration validation

- [ ] 4.1 Verify all handoff checks: pnpm build, pnpm test, pnpm test:integration with real Postgres, openspec validate --all --strict and git diff --check; record exact commands/results and compare final diff against TASK-s2-server criteria 1–6. Confirm shared Compose seed 4491 and out-of-scope files remain untouched.

## Workflow follow-up

- Report the proposal checkpoint through agentctl with --wake and wait for Team Lead approval; start Apply in a fresh Engineer context with the accepted proposal and latest acknowledged handoff.
- Rebase on current main before PR; use agentctl intent/perform/verify/confirm records for push and PR operations, and never push main.
- Obtain independent review and green CI for the exact PR head, address supported findings, then sync/archive this OpenSpec change in the PR as the handoff requires and revalidate the resulting head.
- Report evidence and residual risks through agentctl; completion requires Team Lead acceptance.
