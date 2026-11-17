# Tasks

## 1. Protocol v5

- [x] 1.1 Implement protocol/frames § Protocol version, Client command types and Stage 5 public projection and events using existing bounded asset validation; add one stage5 decoder suite covering valid frames, payload rejection under TypeBox/Ajv, event/view round trips and old-version rejection; run protocol typecheck and tests. Update protocol test literals as required.

## 2. Persistence

- [x] 2.1 Implement server/persistence § Stage 4 room retirement and Relational game results in migration 0006 and schema types; add one migration integration suite proving upgrade from 0005 with stage 4 data, schema constraints, preserved logs/snapshots/membership and idempotent rerun; run it against real PostgreSQL.
- [x] 2.2 Implement server/persistence § Atomic result persistence before broadcast in game-store.appendEntry using terminal core event/snapshot values; extend existing persistence/write-order/failure tests for exact row contents, terminal resignation, result-insert failure, snapshot failure and deduplication; verify transaction rollback and no accepted Update. Run server typecheck and focused integration checks.

## 3. Guarded fixtures and sockets

- [x] 3.1 Implement server/test-fixtures § Named fixture room creation and Stage 5 fixture catalog in the existing builder; extend its unit tests to prove every named state passes invariants and reaches its intended transition; document names, seat roles and commands in apps/server/README.md. Run fixture tests and server typecheck.
- [x] 3.2 Add one stage5 socket integration suite proving handoff criteria 1, 3 and 6 using three guests: Mortgage/Redeem, rejection code, boundary expiry, each liquidation tier, creditor partial payment, freed assets and terminal bankruptcy result row. Compare events and balances on every guest, verify all stored terminal values and no duplicate update.

## 4. Recovery

- [x] 4.1 Implement or verify server/recovery § Stage 5 mortgage recovery equality and Finished core-7 room reload with one stage5 recovery suite covering clean restart, snapshot-plus-tail mortgage progress, identical next boundary and expiry, final reconnect views for all three guests and unchanged result rows; assert no terminal timers.
- [x] 4.2 Verify server/recovery § Unsupported stage 4 games fail safely by extending legacy tests with representative core-6 data and socket ROOM_CLOSED after actual 0006 retirement; assert safe failed recovery of unsupported finished data with no mutation or timers.

## 5. Integrated verification and delivery

- [x] 5.1 Run pnpm build, pnpm test, pnpm test:integration and openspec validate --all --strict; reconcile only obsolete server/protocol expectations and necessary client type placeholders, reporting any placeholders. Compare final diff with every handoff criterion and report concrete results through agentctl.
- [x] 5.2 Commit on agent/task-s5-server and verify git diff --check fb625a1 HEAD; rebase on current main before the PR, recording external push/PR intent, verification and confirmation through agentctl. Open the PR and initiate independent review via the required reviewer handoff; resolve supported findings and verify all CI jobs on the exact final SHA.

## Workflow follow-up

- Team Lead must approve this proposal; Apply starts in a fresh Engineer context after acknowledgement of the latest handoff.
- Archive the OpenSpec change in the PR once independent review passes, as required by TASK-s5-server revision 1. Validate the archived specs and recheck CI on the resulting head.
- Engineer does not merge; completion requires Team Lead acceptance and green independent review/CI evidence.
