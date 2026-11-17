# Design

## Context

See proposal.md for motivation and source references. At fb625a1 core-7 is merged. Protocol frames use a shared bounded AssetIdSchema for house commands. Room execution already appends through one Kysely transaction, snapshots on finish, updates finished status, and publishes only after commit. Recovery uses restoreSession and supports finished rooms on demand. Fixtures use core setup, deterministic state preparation and checkInvariants.

## Goals / Non-Goals

Keep result storage as a projection of accepted core events; retain existing sequencing, deduplication, recovery and fixture guards. No domain decisions in server code, no new result endpoint, no automatic conversion of old game data.

## Decisions

1. Extend CLIENT_COMMAND_TYPES, PROTOCOL_VERSION and the payload branch to reuse AssetIdSchema for Mortgage/Redeem. Retain Type.Unsafe<StateView>; pass public core fields and events through unchanged. Reuse decoder rejection tests under both checker implementations instead of adding a separate validation convention.
2. Add 0006_stage5_rules.sql through the existing migration discovery. Use text room/winner IDs, text rules version, timestamptz finish/creation times, integer final_revision and jsonb elimination/balance columns, all required. room_id is PK/FK to rooms; created_at defaults to now(). Convert the core millisecond finish timestamp to a Date for SQL, preserving exact milliseconds. No new indexes are needed beyond the per-room PK for this scope.
3. In createGameStore.appendEntry inspect the already persisted LogEntry events for GameEnded and insert its payload in that same transaction, using entry.revision and options.snapshot.rulesVersion from the terminal snapshot which the existing room always provides. Require that snapshot to be present and terminal with a non-null rulesVersion before inserting; do not fabricate a fallback version. No new room rule logic or expanded public AppendOptions contract is needed. Retain strict insertion: duplicate commands are intercepted before append, so a conflicting result is an integrity failure rather than an overwrite. An independent transaction or post-broadcast write would violate the handoff.
4. Keep final views sourced from recovered core state, not relational results. Compare SQL results against GameEnded and projectState in tests; this avoids maintaining a second outcome model. Modify production recovery only if focused tests expose an adapter gap.
5. Extend test-fixtures.ts with mortgage-expiry, liquidation-tier-1, liquidation-tier-2, liquidation-tier-3, bankruptcy, final-bankruptcy and mortgage-restart. Use the existing setup helper, generated catalog prices, core rent/mortgage helpers and checkInvariants. For final-bankruptcy use a real core resignation to establish one eliminated seat while preserving three members. Existing shortfall fixtures now exercise bankruptcy under core-7; update obsolete interim expectations only within server/protocol scope.
6. Build focused stage5 socket, recovery and migration suites beside stage4 tests. Three guests receive every accepted event/projection, including the eliminated spectator. Assert balance arithmetic and released ownership directly, and compare result columns to the terminal event. Trigger failures in real PostgreSQL for result and final snapshot insertion, asserting rollback and no Update (a recovery resync remains allowed by server/rooms). Cover clean shutdown and snapshot-plus-tail recovery without relying on shutdown snapshots. Verify deduplication after finish and restart.

## Risks / Trade-offs

- Result write introduces another transaction failure point → inject SQL failures and check rollback plus room recovery.
- Old finished games remain unsupported rather than migrated → retain safe ROOM_UNAVAILABLE behavior and data preservation; retired active rooms return ROOM_CLOSED.
- Core-7 invalidates old inline test states and client literals → update server/protocol fixtures; allow only necessary reported client type placeholders. Escalate any core defect or missing projected field.
- Timeouts can hide recovery differences → fake clock and seeded entropy compare the next boundary explicitly.

## Migration Plan

Migration 0006 is additive except accepted active-room retirement; no logs or snapshots are deleted. Existing migration tracking makes reruns no-ops. Validate against a database migrated through 0005 before applying 0006, retaining representative core-6 snapshot/log data. There is no down migration in this project; do not reopen legacy rooms as rollback. No deployment work belongs to this task.
