# Design

## Context

Base b92ebb7 includes the core-4 state, generator and events. Protocol frames use Type.Unsafe<StateView> and generic core event payloads, so no new frame shape is needed. The server stores full JSON snapshots and calls restoreSession; loadSession already wraps malformed stored state as a room data error. The handshake currently short-circuits closed database rows before opening the room.

TASK-s2-server revision 1 and Team Lead design revision 1 authorize the version bump, closure migration and unsupported-game failure policy. The design source is currently in the TL-stage-2-design worktree at docs/efforts/stage-2-field-money/design.md.

## Goals / Non-Goals

**Goals:** Deliver protocol 2 compatibility, retire stage 1 active rooms without data loss, and prove public stage 2 state survives networking and recovery.

**Non-Goals:** Core changes, client work, Compose/Playwright changes, new rules, stricter runtime view validation, deferred operational features or support for replaying core-3.

## Decisions

1. First implementation commit bumps PROTOCOL_VERSION to 2, updates its assertion/fixtures and the view schema description. Keep Type.Unsafe<StateView> and existing event schema; use a real typed core projection for the stage 2 protocol fixture. Version compatibility remains a server handshake check, not a decoder failure, so clients receive PROTOCOL_VERSION_UNSUPPORTED.
2. Add 0003_stage2_rules.sql with one UPDATE of lobby/playing rooms. Migration tracking protects newly created core-4 rooms on subsequent boots. Test the 0002 -> 0003 upgrade with all statuses and unchanged logs/snapshots/members; retain isolated evidence for the existing 0001 -> 0002 upgrade instead of making its expectations accidentally include 0003.
3. Keep recovery in the existing failed-room path. Test core-3 full-log and actual old-shape snapshot cases. If needed, explicitly reject unsupported persisted rulesVersion inside the server load boundary before calling core recovery; do not add a second engine or infer rules outcomes in infrastructure. Preserve database-error retry semantics.
4. Preserve the existing closed-row handshake short-circuit: migrated closed core-3 rooms return ROOM_CLOSED. A finished core-3 room passes that check, fails opening and returns ROOM_UNAVAILABLE. Direct manager.open of closed core-3 data still registers a failed room and rejects commands with ROOM_UNAVAILABLE. Test these distinct paths. Closed migrated rooms are not scanned by restoreAll; prove boot failure reporting separately with active unsupported rows (e.g. restored legacy data).
5. Reuse existing HTTP/WebSocket helpers and fake clocks with real isolated Postgres databases. Successful Hello helpers use the exported version, intentional version-1 rejection fixtures keep literal 1. Do not touch shared seed 4491 or Compose/Playwright files.
6. Add bounded seeded stage 2 socket coverage for 2/3 guests, composition differences, starting capital and a real forward start crossing. Find a seed/command sequence using the core in test setup, never mutate positions or balances to simulate a crossing. Compare every guest's committed Update and event to the expected reward. Prove snapshot-plus-tail equality with a fresh manager before clean shutdown can hide replay; also prove clean server restart and reconnect equality.

## Risks / Trade-offs

- Closed status takes precedence at Hello; unsupported-game failure is proved using finished rooms, direct manager.open and active restoreAll fixtures.
- Stage 1 core-3 snapshots lack stage 2 fields. Use representative old-shaped JSON, not a current snapshot with only the version changed, and keep log-only coverage too.
- A clean shutdown creates a latest snapshot and can conceal tail-replay bugs. Test crash-style manager recovery separately from clean restart.
- BoardGenerated occurs at creation before normal sockets attach. Prove its wire representation with protocol fixtures and creation log evidence; do not synthesize broadcasts or change event timing.
- No unresolved product decisions. Team Lead proposal approval is required before Apply; use a fresh implementation context after approval.
