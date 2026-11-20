# Design

## Context

See `proposal.md` for motivation. Current `settleDebt` is player-creditor only, `GameState` has a rent slot but no bank charge, mortgage terms do not identify their creation turn, and `GameRoom.loadSession` sends persisted state directly to `restoreSession`. The accepted stage 6 design in `docs/efforts/stage-6-special-cells/design.md` defines the bank-charge shape, upgrade path and recovery boundary.

## Goals / Non-Goals

**Goals:** Preserve stage 5 rent outcomes while applying the same liquidation and bankruptcy engine to a bank creditor; make bank charges recoverable and replayable; allow same-owner next-turn mortgage redemption; keep current stored `core-7` snapshots loadable.

**Non-Goals:** Emit charges from chance or jail, change jail or casino behavior, add client interactions, close rooms, or migrate database rows.

## Decisions

1. **Generalize debt around a creditor union.** Use `{kind:'player', id}` or `{kind:'bank'}` and keep rent-specific output unchanged for player debts. Bank debts debit the payer using the cause's `BalanceChanged.reason` and do not credit a player. Bank bankruptcy pays `min(debt, cash + house refunds)` without mortgage advances, then releases assets and records a null creditor. Duplicating liquidation for bank debts was rejected because it could drift from the accepted stage 5 order.

2. **Keep rent and charge as separate, exclusive slots.** Add `charge: {payerId, amount, cause:'chance'} | null`, an exported pure opener that emits ChargeDue, and PayCharge in the rent command registry. Route both payment types through the same debt settlement; use RentPaid for player rent and ChargePaid for bank charges. Turn closure processes the existing rent path first and then a charge, with the invariant ensuring at most one can be open. Replacing rent with a generic payment model was rejected because it would needlessly alter stage 4-5 state and event contracts.

3. **Extend only affected pending-payment guards.** Build and redeem return PAYMENT_PENDING for a charge; mortgage and sale stay legal. Rent retains RENT_PENDING. Preserve existing handler guard precedence, including AUCTION_IN_PROGRESS and NOT_ACTIVE_PLAYER.

4. **Persist the mortgage's creation turn id.** Both manual and automatic mortgage creation set `lockedTurnId` from the current turn. Redemption checks the id after confirming a mortgage exists and before checking funds. The id is retained after turn closure; it naturally unlocks in any later turn, including a bonus turn, without a clear-at-boundary transition.

5. **Upgrade snapshots in memory before tail replay.** Export a pure `upgradeState` mapping `core-7` to `core-8`, and make it an identity for `core-8`. The server applies it only to a loaded older snapshot before calling `restoreSession`; it does not write a replacement row at the same revision. The next regular snapshot persists the current shape. A tail written under `core-7` may diverge under current rules after a crash; existing recovery marks that room failed and logs the error. SQL migration and room closure were rejected by the accepted stage 6 design.

6. **Bump the shared protocol once.** `StateView`, command types and event payloads change together, so increment `PROTOCOL_VERSION` once and make only the minimum client typing/description changes needed to compile.

## Risks / Trade-offs

- [A core-7 tail may reflect old transitions] → Preserve the existing hard-failure behavior, log the replay divergence, and test it without changing persisted rows.
- [A bank payment could accidentally change rent event order or balances] → Keep the rent branch and its tests unchanged; add exact-balance tests for bank cash, liquidation and bankruptcy paths.
- [A mortgage created during turn closure may receive the wrong lock] → `applyMortgage` reads the still-open current turn; test manual, explicit-payment liquidation and turn-closure liquidation separately.

## Migration Plan

1. Deploy the server/core/client build together at `core-8` / protocol 7.
2. On room load, upgrade old `core-7` snapshots in memory and replay their tail. Do not run SQL or room-closing migrations.
3. If replay diverges, preserve rows and register the room as failed through the existing recovery path. A normal shutdown's next snapshot stores the upgraded state.
4. Rollback is code rollback. No stored row is rewritten at the old revision; snapshots written after new commands require the `core-8` engine to load.

## Open Questions

None. The charge cause is limited to `chance` in this task; later stage 6 work adds its own accepted causes.
