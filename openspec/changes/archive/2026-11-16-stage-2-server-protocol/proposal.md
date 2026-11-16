# Proposal

## Why

Stage 2 core (`core-4`) already generates the board and tracks money, but the wire version and server compatibility evidence still describe stage 1. Expose the accepted state and safely retire unsupported stored games.

Sources: ROADMAP.md stage 2; GAME-BREAKDOWN.md “Участники и поле”, “Начальная настройка и деньги”, “Движение, круг и награда”; accepted stage-2 asset proposal; TASK-s2-server revision 1 and Team Lead design sections Protocol, Server and Delegated decisions.

## What Changes

- **BREAKING**: export protocol version 2, reject version 1 at handshake, and describe the existing core-typed view with board, economy and balances and its public stage 2 events.
- **BREAKING**: migration 0003 closes every lobby/playing room without changing logs or snapshots.
- Treat unsupported core-3 stored games as failed rooms, when actually opened; preserve the closed-row Hello short-circuit and ROOM_CLOSED behavior.
- Prove multi-guest board/capital consistency, lap-reward broadcasts, reconnect and snapshot-plus-tail recovery against real Postgres.
- Out of scope: core rules, client UI, Playwright/Compose scenarios or seed changes, deferred stage 1 work, schema redesign and data deletion.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `protocol/frames`: version 2 and public stage 2 view/event contents.
- `server/persistence`: one-time stage 1 room closure.
- `server/recovery`: unsupported stored games fail safely; board/economy/balances survive restore.
- `server/game-socket`: stage 2 broadcasts/reconnect and unsupported-game failure and closed-room behavior.

## Impact

Only packages/protocol, apps/server and their OpenSpec contracts. No new dependencies, frame fields or core inputs. Existing core -> persist -> broadcast order and localhost binding remain mandatory.
