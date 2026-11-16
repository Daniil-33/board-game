# Proposal

## Why

The merged core-6 implements stage 4, but protocol v3 cannot carry building and selling payloads. The server needs a verified socket and recovery path plus guarded browser fixtures for GAME-BREAKDOWN.md § «Активы, рента и строительство» and § «Ипотека и расчёт долгов» (house sale price only).

## What Changes

- **BREAKING**: protocol v4 adds PayRent, BuildHouse and SellHouse and exposes the existing core public houses, rent and rentQuotes.
- Migration 0005 closes active stored rooms without rewriting game data.
- Verify authoritative commands, specific core errors, idempotency, turn deadline payment, restart and reconnect equality.
- Add a named-state fixture loader available only under NODE_ENV=test and E2E_FIXTURES=1, with invariant validation and atomic room/member/genesis-snapshot persistence.
- Document the fixture API for the e2e task.

## Capabilities

### New Capabilities

- `server/test-fixtures`: guarded named fixture loading for browser and integration tests.

### Modified Capabilities

- `protocol/frames`: version 4, command-specific payloads and stage 4 projection.
- `server/game-socket`: stage 4 authenticated commands, public updates and version 3 rejection.
- `server/persistence`: stage 4 active-room closure migration.
- `server/recovery`: core-6 recovery equality and unsupported core-5 handling.
- `server/timers`: rent auto-payment on existing turn deadlines, including overdue boot.

## Impact

Only packages/protocol, apps/server and OpenSpec deltas change. Reuse core rules and existing sequential persist-before-broadcast pipeline; add no dependencies. Core changes, client code, Playwright scenarios, workflow changes, non-test endpoints and stage 5 rules are out of scope. The stage 4 Team Lead design and TASK-s4-server revision 1 govern this implementation.
