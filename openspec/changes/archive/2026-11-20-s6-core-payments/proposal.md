# Proposal

## Why

Stage 6 needs one deterministic bank-payment path for chance and jail fees, and its automatic liquidation must retain stage 5 behavior. The core also needs a same-turn mortgage redemption lock and a pure upgrade for active `core-7` snapshots so existing rooms continue under the new rules.

## What Changes

- Generalize mandatory debt settlement to a player or the bank, including nullable creditor event fields and bank bankruptcy payout under the accepted stage 5 liquidation rules.
- Add an exclusive bank-charge slot, `PayCharge`, turn-closure settlement, payment guards and public charge events. This task does not add a charge-producing cell.
- Record the turn that creates each mortgage and reject redemption until the next turn, including the existing bonus-turn behavior.
- Bump the rules version to `core-8`; export pure `upgradeState` for `core-7` snapshots and apply it in the server before replaying the stored tail.
- Update protocol types/version for the changed view, command and events, and synchronize affected OpenSpecs.

Out of scope: casino, chance and jail behavior; charge UI; client-facing lock UI; removing interim jail; browser scenarios; SQL migrations or closing rooms; changes to stage 4-5 settlement semantics.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `engine/debt-settlement`: support bank creditors, nullable creditor event data, and bank bankruptcy payout.
- `engine/rent-building`: add mandatory bank charges and payment-pending behavior while preserving rent behavior.
- `engine/mortgage`: persist redeem lock turn ids and enforce same-turn rejection.
- `engine/game-lifecycle`: make `core-8` current and specify the pure `core-7` state upgrade.
- `protocol/frames`: add `PayCharge`, updated public state/events, and the next protocol version.
- `server/recovery`: upgrade supported `core-7` snapshots in memory before replay; preserve failed-room behavior for divergent old tails.

## Impact

Affected areas: `packages/game-core` debt, rent/turn closure, mortgage, state, invariants, projection, lifecycle, money reasons and exports; matching `packages/protocol` schemas and version; `apps/server` snapshot loading and recovery tests; minimal client type/description updates; focused core, protocol and server tests. No database schema change is expected.
