# Design

## Context

See proposal.md for motivation and scope. Base is 7f5f174 (core PR #51); TASK-s4-server revision 1 and the Team Lead stage 4 design are authoritative. Protocol uses TypeBox; command payloads are currently all null. The socket already forwards payload and derives actor from session. Lobby creates games with CURRENT_RULES_VERSION. Room recovery uses restoreSession, snapshots and ordered log tails, and timers use pendingDeadlines. These host boundaries need proof, not rule duplication.

## Goals / Non-Goals

**Goals:** carry core-6 intents and public views, preserve recovery and deadlines, retire old active rooms, and provide an isolated fixture bootstrap for browser evidence.

**Non-Goals:** changing core rules, frame envelopes, stored-game policy, production APIs, client code, workflow files or browser scenarios.

## Decisions

- Keep the per-command schema union; add PayRent with null and BuildHouse/SellHouse with a closed assetId payload. Bound assetId using existing 128-unit storable-id conventions. Keep StateView runtime object validation and static core typing; extend its description. Alternative arbitrary payloads would lose decoder guarantees.
- Reuse actor injection, sequential command submission, persistence and projection; do not add command-specific server rules. Exercise core error forwarding and stale/duplicate guards over sockets. Reuse existing turn timers for rent, including overdue restoration.
- Add 0005_stage4_rules.sql matching previous retirement migrations. Upgrade tests stage a through-0004 database, compare all data around migration and rerun migration after creating a core-6 room.
- Use POST /api/test/fixtures with closed JSON body `{ fixture: string, tokens: string[] }`, 2–6 distinct existing guest tokens in seat order, returning HTTP 201 `{ roomId: string }`. Authenticate tokens through the guest store. Unknown name or bad shape returns INVALID_REQUEST; unknown token returns UNAUTHENTICATED. No caller-supplied state or paths. The first token identifies the creator. Each call creates a fresh room.
- Gate registration from the real environment at server construction and validate E2E_FIXTURES during startup config parsing before DB/listen. Read the same guard at both boundaries so direct createServer cannot bypass it. Dynamically import the loader only when enabled. Absent opt-in registers no route. Test production, staging, development and unset environments, and inspect deployed Compose definitions for opt-in.
- Put named builders in apps/server/src/test-fixtures.ts, importable by e2e; put route/persistence in a separate test-only module. Builders take guest ids and current clock time, construct a deterministic core-6 state using public core setup helpers and explicit scenario state, then pass checkInvariants. Catalog covers regular rent, full-group rent, logistics two holdings, energy, own asset, shortfall, building and an already-open settlement; document exact names and state inputs in server README during Apply. Keep this module free of process startup side effects.
- Persist fixture room, membership and the validated full state in one database transaction; the snapshot is its genesis at the state's actual revision, without fabricated command history. Future commands use normal room open and persistence. Use the manager's clock for deadlines so integration tests can use a fake clock. Validate before insertion; failure leaves no partial room.
- Prove restart equality with full state and per-guest projections, both a clean restart and crash-style snapshot-before-transition plus tail. Cover open rent, used build quota, houses, and overdue rent. Existing stage 3 socket/recovery helpers supply the harness; update assertions that pin protocol version or migration list.

## Risks / Trade-offs

- Fixture bypass of normal lifecycle → explicit double environment gate, fixed registry, core invariants and atomic persistence; no arbitrary-state endpoint.
- Snapshot bootstraps have no prehistory → confined to test-only rooms, with subsequent commands logged normally and recovery equality tested.
- Staging active rooms close at upgrade → accepted disposable-room policy; logs and snapshots remain unchanged. No data conversion or downgrade replay is attempted.
- Tests expecting old core trajectories may need deterministic seeds updated → preserve their original assertions and exercise the intended boundary rather than weakening checks.

## Migration Plan

Deploy protocol v4 and core-6 together; startup applies 0005 before serving traffic. Finished old games remain unsupported and fail safely. A rollback requires a compatible service/database backup; retirement status changes do not convert old states. No workflow or deployment files change.
