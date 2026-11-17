# Stage 5 mortgage, debts and bankruptcy: Team Lead technical design

Effort: `EFF-stage-5-mortgage-debts-bankruptcy`. Handoff
`docs/efforts/stage-5-mortgage-debts-bankruptcy.md` revision 1 (docs PR #57),
accepted by the Team Lead on 2026-11-17 at main `dcd39b3`. Criterion numbers
(C1..C15) refer to the handoff. This document holds only the decisions
delegated to the Team Lead and the interpretations it states; product rules
come from the handoff, `ROADMAP.md` stage 5 and `GAME-BREAKDOWN.md`.

## Versions and stored games

| Item | Choice |
|---|---|
| Rules version | `core-7`, the only supported version |
| Protocol | `PROTOCOL_VERSION = 5` |
| Stored stage 4 games | Migration `0006` closes every `lobby`/`playing` room (logs are kept), as in stages 2-4. There are no production games, and staging rooms are disposable. |
| Results | Migration `0006` also creates `game_results` (see Server). |

## Interpretations (stated, reported to the CTO)

- **I1. Mortgage next to houses.** C1 requires only that the mortgaged asset
  itself has no houses ("evenness still applies to the rest of the group").
  So in a group with houses `[1,1,0]`, the 0-house asset may be mortgaged.
  The group then cannot be built on until it is redeemed (stage 4 hook).
  House rent does not depend on group completeness, so it is unaffected.
  If that mortgage expires, the freed asset returns to the bank and the
  siblings keep their houses (≤ 1 each, by evenness) and their house rent.
  The stage 4 invariant "houses only on wholly owned groups" becomes:
  houses only on monopoly assets owned by an active player, with group
  evenness (unowned assets count as 0). Building still requires the whole
  group, unmortgaged. Selling requires ownership and evenness. Doubling
  still requires one owner of the whole group. (TL decision 2026-11-17, on
  a TASK-s5-core-mortgage question.)
- **I2. "Sale proceeds" in the loss (C6) are house-sale refunds only.**
  Mortgage advances count toward covering the debt but are not in the loss,
  because they must be repaid. Their cost is the lost rent term.
  GAME-BREAKDOWN says "выручка от продажи".
- **I3. Bankruptcy takes no mortgages (C9).** "Proceeds" are the resale of
  all houses. The creditor receives `min(debt, cash + house refunds)`. Since
  full liquidation (with mortgages) could not cover the debt, this always
  equals all of the bankrupt's cash after the house sales. Mortgages are
  cleared and the assets are freed; the bank gives no advance.
- **I4. Rent fixed at landing stays fixed.** Liquidation changes only the
  payer's assets, never the asset the rent is owed on. Rent is not
  recomputed at payment.
- **I5. No expiry inside a decision or auction.** A mortgaged asset is
  owned, so it is never the subject of a purchase decision or an auction.
  Expiry runs at the turn boundary, after the mandatory settlement and after
  any auction closed the turn. The escalation example in the handoff
  therefore cannot occur.

## Core (`packages/game-core`)

### State additions

```ts
interface GameState {
  // existing ...
  /** Mortgaged assets by asset id; absent = not mortgaged. */
  readonly mortgages: Readonly<Record<string, Mortgage>>;
  /** Elimination records in order; `eliminated` stays as the id list. */
  readonly eliminations: readonly Elimination[];
  /** Time the game finished; non-null exactly in `finished`. */
  readonly finishedAt: Timestamp | null;
}
interface Mortgage {
  readonly advance: Money;          // the advance actually received
  readonly lapsCompleted: number;   // 0..7; reaching 8 expires it
  /** Active players who have not closed a turn in the current lap of this mortgage. */
  readonly pending: readonly PlayerId[];
}
interface Elimination {
  readonly playerId: PlayerId;
  readonly reason: 'resigned' | 'bankrupt';
  readonly at: Timestamp;
  readonly creditorId: PlayerId | null; // bankrupt only
}
```

`isMortgaged(state, id)` becomes `Object.hasOwn(state.mortgages, id)`. Every
stage 4 hook already routes through it.

### Mortgage and redeem (C1-C3)

Commands `Mortgage { assetId }` and `Redeem { assetId }` have guard `turn`
and the same check order as stage 4: payload → auction → actor → deadline →
legality. The pure helpers `mortgageLegality` and `redeemLegality` are shared
with the client.

- Mortgage, legal when:
  - it is the actor's turn in `playing`, with no auction and no purchase
    decision (`DECISION_PENDING`);
  - **an open rent settlement is allowed**;
  - the asset is any asset (`NOT_AN_ASSET` otherwise) and the actor owns it
    (`NOT_OWNER`);
  - it is not mortgaged (`ALREADY_MORTGAGED`) and has no houses
    (`HAS_HOUSES`).

  Effect: credits `advance = Q(50·price/100)` (`BalanceChanged` reason
  `mortgage`), creates the mortgage with `lapsCompleted: 0` and `pending:` the
  current `order`, and emits `AssetMortgaged { playerId, assetId, advance,
  auto: false }`.
- Redeem, legal under the same turn conditions plus:
  - no open rent (`RENT_PENDING`);
  - the asset is mortgaged (`NOT_MORTGAGED`);
  - the balance is at least the advance (`INSUFFICIENT_FUNDS`).

  Effect: debits the stored `advance` (reason `redeem`), deletes the mortgage
  and emits `AssetRedeemed { playerId, assetId, amount }`.
- `SellHouse` is now also legal during the seller's own open rent (C3).
  `BuildHouse` keeps `RENT_PENDING`.

### Collective lap and expiry (C4, C5)

The counter belongs to each mortgage, so it moves with the asset in stage 7.

- A mortgage starts with `pending` = all active players.
- **Turn boundary.** In `closeTurn`, after `settleMandatory` and
  `TurnEnded` and before the next `TurnStarted`, for each mortgage in board
  order:
  1. remove the closing player from `pending`;
  2. if `pending` is empty, increment `lapsCompleted` and reset `pending` to
     the current `order`;
  3. if `lapsCompleted` reaches 8, the mortgage **expires**: the asset is
     freed (owner and mortgage deleted), the advance stays with the player,
     and the core emits `MortgageExpired { playerId, assetId, advance }`.
- **What counts.** Every closed turn counts for its player: a bonus turn
  (which makes no extra progress, since the player is already removed), a
  turn in jail, and a turn closed by `sent-to-jail`. A turn that closes
  after the mortgage was taken counts, including the mortgagor's current
  turn. So one lap = every active player closed one turn since the lap
  began.
- **Eliminations.** An eliminated player is removed from every `pending` at
  once, but a lap completes only at a turn boundary (the next one), so expiry
  always happens at a boundary.
- **Projection.** `remainingLaps = 8 − lapsCompleted` and `pending` (who
  still has to move this lap).

### Debt settlement (C6-C8)

One function, `settleDebt(state, { payerId, creditorId, amount, cause },
now)`, is used by `PayRent` and by `settleMandatory` (stage 6 reuses it). The
payment is the rent amount.

1. If `cash ≥ amount`, pay as in stage 4.
2. Otherwise `deficit = amount − cash`. If
   `maxProceeds(payer) = Σ refunds of all houses + Σ advances of all
   unmortgaged assets` is below the deficit, the payer goes bankrupt (below).
3. Otherwise `planLiquidation` returns the optimal plan. The core applies its
   actions in the plan's canonical order:
   - house sales emit `HouseSold { …, auto: true }` with `BalanceChanged`
     reason `house-sale`;
   - mortgages emit `AssetMortgaged { …, auto: true }` with `BalanceChanged`
     reason `mortgage`.

   It then emits `LiquidationApplied { payerId, creditorId, debt, cash,
   proceeds, loss, surplus, actions }`, pays, and emits `RentPaid`.

`RentPaid` becomes `{ payerId, ownerId, assetId, amount, auto }`; the stage 4
`shortfall` and `paid` fields are removed. The interim shortfall rule is
deleted. Liquidation is atomic, inside the one command that pays.

### Liquidation search and proof of optimality (C6, C7)

**Model.** The payer `P`'s assets are partitioned into rent groups:
- each monopoly group;
- the logistics group;
- the energy group.

An **option** for group `G` is a final configuration of `P`'s assets in `G`:
- houses `h'` with `h' ≤ h` per asset and evenness (`max − min ≤ 1`) when
  the group has houses;
- mortgage flags `m'`, where an asset may become mortgaged only if
  `h'_a = 0`, and existing mortgages stay.

Every even `h' ≤ h` is reachable by legal single sales, since you always
sell from a current maximum that is still above its target. A target with
`cur_i > target_i` but no such maximum would contradict the target's
evenness. So options are exactly the reachable final states. "Keep
everything" is option 0 of every group.

**Per option, all in quanta:**
- `proceeds = Σ sold houses × refund + Σ new advances`;
- `loss = Σ sold houses × (cost − refund) + 8 × (Rref_G(before) −
  Rref_G(after))`;
- `affected` = the number of assets whose houses or mortgage changed.

**Reference rent** `Rref_G(config) = Σ rentFor` over `P`'s assets in `G`
under that configuration, with the stage 4 formulas, dice sum 7 for energy,
and 0 for a mortgaged asset. Group effects (doubling, which counts mortgaged
assets; the logistics and energy holdings, which count only non-mortgaged
ones) are inside `Rref_G`.

**Separability.** A rent formula reads only:
- the asset's own houses and mortgage;
- ownership and mortgages within its own group;
- the dice sum.

Other players' assets do not change. So the total loss, proceeds and
`affected` are sums of per-group terms, and the groups' option sets are
independent.

**Objective.** Over all option vectors with `Σ proceeds ≥ deficit`, minimize
lexicographically:
1. `Σ loss`;
2. `surplus = Σ proceeds − deficit`;
3. `Σ affected`;
4. the **id key**: the vector of per-group canonical option ranks, groups
   in board order of their first cell. Within a group, options are ranked
   by the per-asset vector `(housesSold, newlyMortgaged ? 1 : 0)` over the
   group's assets in board order, compared lexicographically, smallest
   first.

**Algorithm: exact dynamic programming over exact proceeds.**
- Process the groups in board order with a table indexed by the exact
  proceeds sum `p` (in quanta, `0..maxProceeds`).
- Each cell keeps the lexicographic minimum of `(Σ loss, Σ affected, id-key
  prefix)` and a back-pointer.
- At the end, take `min over p ≥ deficit` of `(loss, p − deficit, affected,
  id key)`.

**Why this is exact:**
- `loss` and `affected` are additive.
- For two partial vectors with the same `p`, every completion adds the same
  terms to both and gives the same final surplus, so the lexicographically
  smaller prefix stays smaller (the Bellman principle for lexicographic
  sums).
- The id key is a fixed-length vector compared position by position in
  processing order, so a smaller prefix with equal additive keys never
  loses.
- `p` is kept exactly (not capped), so the surplus is exact.
- No option and no `p` is pruned.

**Size and time.**
- Options per group: at most a few hundred (a 3-asset group at 4 houses has
  29 even vectors, times the mortgage choices of 0-house assets).
- `maxProceeds/10` is at most about 10⁴.
- About 10 groups × 10² options × 10⁴ cells ≈ 10⁷ steps.
- Target: the worst case (one player owns all 28 assets with 4 houses on
  every monopoly asset, with a deficit just under and just over
  `maxProceeds`) runs in ≤ 100 ms measured. The test asserts < 1 s on CI to
  avoid flakes and logs the measured time.

**Action order of a plan.**
- House sales group by group in board order. Each sale is taken from the
  current maximum, ties broken by board order, so every intermediate state
  is legal.
- Then mortgages in board order.
- The emitted events replay through the normal reducers.

**Brute-force reference (tests).**
- Breadth-first search from the start position over **single legal
  actions** (sell one house, mortgage one 0-house asset) gives every
  reachable final state.
- For each final state, evaluate the objective directly: loss from the full
  `rentFor` on the whole resulting `GameState` (not per group), proceeds,
  surplus, affected, id key. Pick the minimum.
- Compare it with `planLiquidation` on many seeded generated positions
  (small portfolios: up to 4 groups and 3 houses) and on hand-written edge
  cases: ties, surplus tie-breaks, doubling loss, logistics/energy holdings,
  exact cover, and "only mortgages".

### Bankruptcy (C9) and resignation (C10)

**Bankruptcy** of `P` to creditor `C` for `debt`, all in one command:
1. Sell every house in legal order (`HouseSold auto: true`, `BalanceChanged
   house-sale`).
2. `paid = min(debt, balance)` (I3). Debit `P` and credit `C` (reason
   `rent`), unless `paid` is 0.
3. Release every asset of `P`: delete the owners, houses and mortgages, and
   emit `AssetsReleased { playerId, assetIds, reason: 'bankrupt' }`.
4. Emit `PlayerBankrupt { playerId, creditorId, debt, paid, writtenOff }`.
5. Call the trade-offer hook `cancelOffersOf(state, P)` (a no-op until
   stage 7).
6. Eliminate `P`:
   - append to `eliminated` and to `eliminations` (reason `bankrupt`);
   - remove `P` from `order`, `positions`, `jail` and every mortgage's
     `pending`;
   - drop any `pendingBonus`.
7. The turn closes with `TurnEnded reason 'bankrupt'`. The next player is
   the one after `P` in the order as it was before removal, or the game ends.

**Resignation.**
- The player's assets are released the same way (`AssetsReleased reason
  'resigned'`); houses give no money back.
- The balance is unchanged (stage 2). The elimination is recorded with
  reason `resigned`.
- R1/R2 still drop an open settlement where the resigner is the payer or
  the owner.
- The stage 4 rule "a resigned owner's asset brings no rent" is removed,
  because no eliminated player owns anything.

**Game end (C11).**
- When one active player remains after any elimination: `phase:
  'finished'`, `winner`, `finishedAt = now`, and `GameEnded { winner, at,
  eliminations, finalBalances }`.
- `finalBalances` holds every player's balance.
- A terminal elimination does not run lap processing or start a turn.

### Invariants (added)

- `mortgages` keys are assets owned by an active player.
- A mortgaged asset has no houses.
- The `advance` is `Q(50% price)`.
- `0 ≤ lapsCompleted < 8`, and `pending` ⊆ `order`.
- No eliminated player owns an asset, a house or a mortgage.
- `eliminations` matches `eliminated` (same ids, same order).
- `finishedAt` is non-null exactly in `finished`.
- No `rent` with `shortfall` exists any more; balances are never negative.

### Projection (C12)

Everything is public:
- `mortgages`, with `remainingLaps` and `pending`;
- `eliminations`;
- `result` (`{ winner, finishedAt, eliminations, finalBalances }`, in
  `finished` only);
- the stage 4 `rentQuotes`, where a mortgaged asset quotes 0.

The events above are public, so every client can show the liquidation
summary from `LiquidationApplied` and the bankruptcy from `PlayerBankrupt`.

## Protocol (`packages/protocol`)

- `PROTOCOL_VERSION = 5`.
- New commands `Mortgage` and `Redeem`, with payload `{ assetId: string }`
  (same validation as `BuildHouse`).
- The view stays `Type.Unsafe<StateView>`.

## Server (`apps/server`)

- Migration `0006`:
  - closes `lobby`/`playing` rooms;
  - creates `game_results`: `room_id` (PK, FK rooms), `rules_version`,
    `winner_id`, `finished_at`, `final_revision`, `eliminations jsonb`
    (`[{playerId, reason, at, creditorId}]`), `final_balances jsonb`,
    `created_at`.
- **Results.** When an accepted command's events include `GameEnded`, the
  room inserts the `game_results` row **in the same transaction** as the log
  append and snapshot (persist before broadcast). The room is marked
  finished.
- **Recovery and reload.** A finished room still loads and serves its final
  view (game-over screen), and mortgages with their `pending` and laps come
  back from the snapshot and the log (C14).
- **Test-only fixtures** (the stage 4 loader, `NODE_ENV=test` and
  `E2E_FIXTURES=1` only) gain stage 5 builders:
  - a mortgage one lap from expiry;
  - a payer who needs liquidation;
  - a payer who goes bankrupt to a player creditor;
  - two players left.
- **Integration tests:**
  - mortgage and redeem over sockets;
  - expiry;
  - liquidation and bankruptcy views on every guest;
  - the `game_results` row;
  - restart with mortgages;
  - restart of a finished room.

## Client (`apps/client`)

Functional only (C13):
- Mortgage and Redeem controls on the asset card, enabled from
  `mortgageLegality` / `redeemLegality`. A disabled control shows the reason.
  The labels show the advance and the redeem amount.
- Mortgage state and `remainingLaps` on the asset card.
- A liquidation summary for every viewer (actions, proceeds, payment) from
  `LiquidationApplied`, and a bankruptcy notice.
- An elimination screen for the eliminated viewer, who keeps viewing as a
  spectator.
- A game-over screen with the winner, the elimination order with reasons
  and times, and the final balances. It renders from `view.result`, so it
  survives reload.
- PixiJS: a mortgage marker per cell.

## Tasks and order

```
TASK-s5-planner (pure liquidation search) ─┐
                                           ├─> TASK-s5-core-debts ─┬─> TASK-s5-server ─┐
TASK-s5-core-mortgage (core-7 mortgage) ───┘                       └─> TASK-s5-client ─┴─> TASK-s5-e2e
```

- **Planner and core-mortgage start now, in parallel.** The planner is a
  new pure module with an injected rent function and touches no existing
  file except one `index.ts` export line. Core-mortgage owns the state and
  rules changes. The planner merges first or second; core-mortgage rebases
  the `index.ts` export if both touch it.
- Core-debts wires the planner to the real `rentFor`, then adds
  `settleDebt`, bankruptcy and game end.
- Server and client run in parallel after core-debts. The server merges
  first and the client rebases.
- At most two Engineers at a time.

## Evidence plan

Per task: an independent review, and green CI on the exact head (`ci`,
`compose-browser`, `compose-browser-seeded`).

Effort completion (the handoff list):
- the 7 browser scenarios with 3 clients;
- planner brute-force comparison and the measured worst-case time;
- replay tests for the new rules;
- `openspec validate --all --strict`;
- green CI on the final main, with staging serving the final SHA;
- `ROADMAP.md` "Сделано".
