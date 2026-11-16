# Tasks

## 1. Protocol

- [ ] 1.1 Implement protocol/frames Protocol version, Client command types and Stage 3 public projection and events: bump to v3, extend null-only intents and view documentation; verify round trips, TypeBox checks and malformed payload rejection with protocol tests and package typecheck.

## 2. Retirement and stored data

- [ ] 2.1 Implement server/persistence Stage 2 room retirement with migration 0004 and upgrade/idempotency tests preserving all non-status data; retain isolated historical upgrade tests and verify with real Postgres.
- [ ] 2.2 Verify server/recovery Unsupported stored games fail safely and server/game-socket Stage 2 stored game using authentic core-4 log/snapshot fixtures, a healthy core-5 room and closed/finished Hello tests; assert unchanged data and no failed-room timers.

## 3. Auction transport and deadlines

- [ ] 3.1 Implement server/game-socket Auction responder commands coverage in a focused integration test module using existing helpers: three sockets bid/outbid/pass/AFK/win and unsold; assert persisted broadcasts, non-owner actor, stale rejection, exact duplicate no-op, v2 Hello refusal and unchanged frame shapes.
- [ ] 3.2 Verify server/timers Auction timers follow state in room integration tests: exact response deadline, choice pause/resume remainder, EndTurn and turn-deadline settlement; retain generic timer handling unless an infrastructure defect is proven.

## 4. Recovery

- [ ] 4.1 Verify server/recovery Stage 3 recovery equality with pending decision and auction clean restart/reconnect plus crash-style snapshot/tail restoration; compare full states and per-viewer projections.
- [ ] 4.2 Verify server/timers Overdue response at boot using real Postgres recovery at an advanced fake time; assert automatic pass persistence without further time advance and next deadline arming.

## 5. Integration verification

- [ ] 5.1 Run pnpm build, pnpm test, pnpm test:integration including migration upgrades, openspec validate --all --strict and git diff --check; compare final diff against TASK-s3-server revision 1 and record evidence through agentctl.

## Workflow follow-up

- Obtain Team Lead proposal approval before Apply; use a fresh Engineer context per the role contract.
- Rebase on current main before PR; commit/push only agent/task-s3-server with agentctl external-operation records.
- Open PR, obtain independent exact-head review and green CI for both jobs; address valid findings.
- Archive the OpenSpec change in the PR after review passes, revalidate the archived result and request Team Lead acceptance with current evidence.
