# Proposal

## Why

Core-5 implements stage 3 purchase and auctions, but protocol v2 cannot send those player intents. The server needs the matching wire contract and proof of timers and recovery during these phases.

Sources: TASK-s3-server revision 1; effort revision 2; Team Lead design Protocol and Server sections; GAME-BREAKDOWN.md § «Покупка и аукцион» and § «Начальная настройка и деньги»; ROADMAP.md stage 3.

## What Changes

- **BREAKING**: protocol v3 adds BuyAsset, StartAuction, Bid and PassAuction, each with null payload; public projection documentation includes owners, purchase and auction.
- Prove authenticated non-owner bidding, persist-before-broadcast, stale response rejection and duplicate idempotency through real sockets.
- Prove pendingDeadlines-driven response timers, turn pause/resume and recovery including overdue response deadlines on boot.
- **BREAKING**: migration 0004 closes lobby/playing stage 2 rooms without changing logs, snapshots or membership; unsupported core-4 follows the failed-room path.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `protocol/frames`: v3, new intents and public projection documentation.
- `server/game-socket`: v2 refusal and auction responder commands/updates.
- `server/persistence`: stage 2 room retirement.
- `server/recovery`: core-4 failure policy and exact decision/auction restoration.
- `server/timers`: response deadlines and paused/resumed turn timers.

## Impact

Only packages/protocol, apps/server and associated OpenSpec deltas. No dependencies or architectural changes. Core rules, client UI, Playwright, Compose and later-stage mechanics are out of scope. Exact duplicate frames retain the existing original-Ack contract and never apply twice; new command ids with stale response targets are rejected.

## Team Lead scope clarification (2026-11-16)

The Command union expansion forces two mechanical client edits in this PR: `actionAvailability` in `apps/client/src/game/view.ts` and the availability fixture in `apps/client/src/__tests__/components.test.ts` each gain `BuyAsset`, `StartAuction`, `Bid` and `PassAuction` set to `false`. These are type-forced placeholders, replaced by TASK-s3-client. No other client changes are authorized; the server PR still merges first.
