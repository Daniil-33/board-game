# Tasks

## 1. Protocol v4

- [ ] 1.1 Implement protocol/frames «Protocol version», «Client command types» and public projection requirements in existing schemas; verify accepted/rejected payload tables, hostile asset ids, frame round trips and protocol package typecheck/tests.

## 2. Stored room migration

- [ ] 2.1 Add 0005_stage4_rules.sql implementing server/persistence «Stage 3 room retirement»; verify a real-Postgres through-0004 upgrade preserves logs, snapshots, members and finished/closed rows, retires active rows, and reruns harmlessly. Update expected migration lists and run the migration integration suite.

## 3. Test fixture bootstrap

- [ ] 3.1 Add named deterministic builders in one test-only fixture module for server/test-fixtures «Named fixture room creation»; verify each built core-6 state passes invariants for supplied guest ids and clock time, and invalid constructed states fail validation.
- [ ] 3.2 Add one guarded loader module implementing server/test-fixtures «Fixture environment guard» and «Named fixture room creation» with atomic snapshot persistence; wire startup and route registration. Verify real-Postgres HTTP loading, absent route without opt-in, startup rejection outside test, invalid token/name/state and duplicate guest rollback, plus production/staging configuration exclusion. Run server typecheck and focused tests.
- [ ] 3.3 Document server/test-fixtures «Fixture interface documentation» in server README: environment, request/response, fixture catalog, guest seating and builder format; verify a documented request creates a room whose guests connect normally.

## 4. Socket, timer and recovery evidence

- [ ] 4.1 Implement proof for server/game-socket «Stage 4 protocol handshake» and «Stage 4 authenticated intents» in one focused integration test module: three guest payment/balance broadcasts, build/specific rejection/sell, stale commands and duplicate delivery; verify no extra log rows or updates and v3 Hello refusal plus migrated ROOM_CLOSED.
- [ ] 4.2 Implement proof for server/timers «Rent uses the turn deadline» and server/recovery «Stage 4 recovery equality» in one focused integration test module: fake-clock payment, open settlement restart/reconnect, used build quota/houses restart, crash-style snapshot plus tail equality, and overdue boot payment. Verify full state and per-guest projection equality, accepted log order and no duplicate payment.
- [ ] 4.3 Extend existing legacy recovery coverage for server/recovery «Unsupported stage 3 games fail safely»; verify unsupported core-5 data is retained and healthy core-6 rooms still restore.

## 5. Integrated verification

- [ ] 5.1 Run pnpm build, pnpm test, pnpm test:integration (real PostgreSQL), openspec validate --all --strict and git diff --check; compare final scope and evidence against all TASK-s4-server acceptance criteria and record results through agentctl.

## Workflow follow-up

- Submit this proposal to the Team Lead through agentctl; Apply waits for approval as TASK-s4-server revision 1 requires. Start Apply in a fresh Engineer context after acceptance.
- Rebase on current main before PR, commit and push only agent/task-s4-server using recorded external operations; open PR and initiate independent review using the required handoff template.
- Resolve supported findings, obtain green CI for the exact final SHA, and archive this change in the PR after review passes, then repeat applicable validation.
- Report PR, checks, review and residual risks to the Team Lead. Completion requires Team Lead acceptance; do not merge as Engineer.
