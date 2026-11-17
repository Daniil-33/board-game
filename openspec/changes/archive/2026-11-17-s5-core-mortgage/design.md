# Design

## Context

See proposal.md for motivation and source revisions. The base is dcd39b3; stage-4 rent and building route mortgage checks through rent.ts:isMortgaged, currently false. closeTurn centralizes settlement and TurnEnded before selecting bonus/next turns; finishAuction also uses it for deferred resignation. Resignation already preserves setup/auction progress and R1/R2. Session restoration validates snapshots and replays commands with recorded contexts.

The Team Lead resolved the I1 expiry invariant conflict on 2026-11-17: houses survive sibling expiry, partial groups remain valid with active ownership and whole-group evenness (unowned assets count as zero). This decision is recorded in the rent-building delta.

## Goals / Non-Goals

Implement the exact state/command/lap contracts in engine/mortgage and the changed resignation, projection, lifecycle and rent-building deltas. Keep the stage-4 debt settlement and RentPaid shape until core-debts. No liquidation integration or network changes. No compatibility adapter for older core versions.

## Decisions

### State and helpers

Add Mortgage {advance, lapsCompleted, pending} and Elimination {playerId, reason: 'resigned' | 'bankrupt', at, creditorId} to state.ts, with mortgages {}, eliminations [] and finishedAt null in genesis. Keep eliminated for existing consumers. Add one mortgage.ts module for pure legality, integer advance, handlers and boundary processing; use own-key lookup for records. Export helpers through index.ts and register commands in rules.ts using existing turn guards. Reuse creditBalance/debitBalance and quantumRatio(price, 2).

Shared helpers omit time, as house helpers do; handlers retain payload -> auction -> actor -> deadline -> legality ordering after registry envelope checks. Mortgage permits rent; redeem rejects rent. Add a parameter to house common legality (or equivalent small split) so sale permits rent while build still rejects it. Avoid duplicating legality in handlers or the client.

### Boundary integration

Process mortgages only in closeTurn after settlement/TurnEnded, before any next TurnStarted. Return immediately for terminal closure before processing. Iterate board cells, not record insertion order. For each term remove the closing player, complete at most one lap, reset to current order, or free the asset and emit expiry. No timers or extra revision. Removing eliminated ids happens during resignation immediately, including deferred auction closure; pending can be empty until the next actual boundary. Bonus turns count under the same algorithm, not a separate round tracker. This preserves the per-mortgage mid-lap start contract.

### Resignation and results

Keep existing successor/setup/auction logic. Release owned assets in board order, deleting houses/mortgages without balance changes. Append the detailed elimination at context.now, remove pending membership and call cancelOffersOf (no-op hook). Preserve R1/R2. Retain PlayerResigned and add AssetsReleased before turn closure; all preexisting relative turn/auction events remain ordered. Set finishedAt and enriched GameEnded only when the game finishes, without lap processing or a new turn. finalBalances includes all players. The result projection uses null outside finished and the specified object in finished.

### Invariants and rent

Replace the stage-4 stub with own-key mortgage presence; existing regular doubling and holdings paths already share this hook. Remove the resigned-owner rent shortcut because eliminated ownership becomes invalid. Keep shortfall checks and settlement unchanged. Validate mortgage ownership, zero houses, advance, term and unique pending membership. In finished, order is null: pending membership is checked against surviving active participants (equivalent to the final active order), without mutating terms for a terminal lap. Validate elimination alignment and finishedAt; forbid eliminated ownership. Replace whole-group ownership in house validity with active asset ownership; retain whole-group evenness. Build still requires the full group and no mortgages; sale still checks its own ownership and group maximum.

### Projection and verification

Extend exhaustive state/event visibility maps and derive detached views. Add remainingLaps to projected mortgages while retaining stored fields; expose detached result and elimination data. No session serialization format changes beyond core-7 state itself. Use existing command/replay test helpers and seeded dice controls to exercise behavior through the engine. Tables cover each rejection and all rent families. Exact event order, expiry timing, rejected-state/RNG identity and snapshot restoration are assertions, not only end-state balances.

## Risks / Trade-offs

- Deferred auction resignation can leave a removed turn owner: test pending removal immediately and expiry only when the auction actually closes the turn.
- Expiry beside houses changes the ownership invariant: test [1,1,0] through eight laps, retained rent, build rejection and allowed sale.
- core-7 changes public types: repair only mechanical out-of-core compilation failures and report each. Protocol/server/client feature work remains separate.
- The planner task also exports through index.ts: reconcile that export when rebasing; do not edit its module.
- A terminal game keeps unexpired winner mortgages: no lap processing, but elimination removes departing players from pending.

## Migration Plan

This task changes only the supported core version; server migration 0006 belongs to the server task. Do not add old-version replay support. Before PR, rebase on current main, run the required checks and report any fixture repin. Rollback uses the previous release as a unit; no data migration is performed here.

Proposal approval is required before Apply in a fresh Engineer context. At that boundary reread handoff revision 1, this change and the TL I1 decision. After implementation request exact-head independent review through agentctl, archive in the PR once review passes, rerun checks/CI for the resulting head, then obtain Team Lead acceptance.
