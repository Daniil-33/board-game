# Proposal

## Why

Purchase and auction views currently put viewers who owe no response into dismissible modal surfaces, hiding live decision status after dismissal. The follow-up closes the review items left by PR #89 while preserving its required responder locks and existing game behavior.

## What Changes

- Show purchase decisions as a non-modal status for all non-deciding viewers, including eliminated players and spectators; only the deciding player gets the locked dialog.
- Keep the mobile auction sheet only for its responder; show live auction content inline to every other viewer on desktop and mobile.
- Generate logistics rent tiers for the actual group size.
- Synchronize every e2e client after prompt and turn actions using the acting client's revision.
- Restore the canonical asset-inspection statement that uses only server-projected data.

Out of scope: sound, new surfaces, protocol/server/StateView changes, changes to commands, timers, amounts or legality, and all other game-core behavior. Relevant rules remain unchanged under GAME-BREAKDOWN.md headings “Покупка и аукцион” and “Активы, рента и строительство”.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `client/game-screen`: non-responders keep live purchase and auction status without a modal surface.

## Impact

Affected areas are the purchase and auction widgets and their tests, `packages/game-core/src/rent.ts` and its tier test, `e2e/compose.spec.ts`, `e2e/game-layout.spec.ts`, and the canonical game-screen spec. No APIs, dependencies, server or protocol changes are expected.
