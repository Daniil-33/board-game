# Design

## Context

See proposal.md for scope and sources. Base is 1a8d32f (core PR #34). The task worktree is clean on agent/task-s3-server. The Team Lead design is available in the TL-stage-3-design worktree; its Protocol and Server decisions are authoritative for this task.

GameConnection already submits commands with the authenticated guest as actor; it does not gate by turn owner. GameRoom serializes core -> store -> broadcast, performs durable command-id deduplication, and rebuilds timers from pendingDeadlines after commits, loads and reloads. Core-5 already provides the response target and paused turn semantics. Existing timer tests cover automatic auction passes after turn expiry, but not the complete socket and recovery acceptance matrix.

## Goals / Non-Goals

Prove the existing infrastructure accommodates core-5 while updating its wire allowlist and retirement migration. Avoid parallel server rule implementations. No changes to frame shapes, stored-game policy, client files or core rules.

## Decisions

- Extend CLIENT_COMMAND_TYPES and set PROTOCOL_VERSION to 3. Keep null payloads, Type.Unsafe<StateView>, and existing expectations. Add schema round trips and non-null rejection tests. Update view documentation with ownership, purchase and auction fields. A new frame union would be unnecessary because the established command schema supports these intents.
- Preserve generic session actor and deadline handling unless a focused test exposes an infrastructure defect. Do not add responder selection, bid computation or turn-pause logic to the host: these belong to core-5.
- Preserve original Ack on identical command-id redelivery, including across recovery; distinguish this from a stale response with a fresh command id (TARGET_MISMATCH). This reconciles task criterion 2's no-double-effect intent with the accepted socket contract.
- Add migration 0004_stage3_rules.sql following 0003's status-only update. Test upgrade from a database stopped at 0003 with all room statuses and unchanged logs/snapshots/members. Preserve the historical 0003 upgrade test by constraining its migration directory to that version.
- Obtain authentic core-4 fixtures from the parent history before core-5, rather than relabelling core-5 data. Test both snapshot-plus-tail and whole-log rejection alongside healthy core-5 recovery, including closed/finished socket error precedence.
- Use the existing real-Postgres harness, fake clock, seeded entropy and real WebSocket helpers. Find deterministic free-asset landings from valid sessions, then issue all auction intents through authenticated sockets. Verify every member's Update against persisted events and public state.
- Test three guests with bid, outbid, pass, AFK and win, plus an unsold auction. Cover choice resume, EndTurn settlement and deadline settlement. For decision and auction recovery, compare full state and per-viewer projections before deadlines, and test both clean-shutdown snapshots and crash-style snapshots with tails. Advance boot time beyond the response deadline in a separate test.

## Risks / Trade-offs

- Protocol v3 breaks older clients -> intentional version refusal; coordinate the client task without editing it.
- Deterministic fixtures can drift with entropy consumption -> assert the landing and response identities, replay actual persisted setup inputs, use bounded searches only in test helpers.
- Broad historical tests assume migration 0003 is latest -> adjust version expectations and isolate historical upgrades without weakening their assertions.
- Retirement is irreversible by status alone -> do not automatically reopen old rooms; logs and snapshots remain intact. No core-4 conversion is authorized.
- Missing core behavior -> stop affected work and ask the Team Lead; do not patch game-core within this task.

## Migration Plan

Run tracked migration 0004 once before serving protocol v3. New rooms use the already-merged core-5 default. Keep localhost binding unchanged. Rollback requires operator-managed status decisions; this change does not reopen retired games or rewrite history.
