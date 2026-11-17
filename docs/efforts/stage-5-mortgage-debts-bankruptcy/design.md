# Stage 5 mortgage, debts and bankruptcy: Team Lead technical design

Effort: `EFF-stage-5-mortgage-debts-bankruptcy`. Handoff
`docs/efforts/stage-5-mortgage-debts-bankruptcy.md` revision 2 (revision 1 merged in PR #57 as `044fdf9`;
revision 2 in PR #59), accepted by the Team Lead on 2026-11-17. Criterion numbers
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

CTO 2026-11-17: I3, I6 and the C7 representation choices are accepted.

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
- **I2.** Withdrawn: the loss function was removed in handoff revision 2.
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

### Debt settlement (C6-C8, handoff revision 2)

One function, `settleDebt(state, { payerId, creditorId, amount, cause },
now)`, is used by `PayRent` and by `settleMandatory` (stage 6 reuses it).

1. If `cash ≥ amount`, pay from cash only.
2. If `cash + Σ resale of every house + Σ advance of every non-mortgaged
   asset < amount`, the payer goes bankrupt at once (below).
3. Otherwise run **liquidation**, step by step. After every single step
   (one mortgage or one house sale), stop as soon as `cash ≥ amount`, then
   pay.

`RentPaid` becomes `{ payerId, ownerId, assetId, amount, auto }`. The stage 4
`shortfall` and `paid` fields and the interim shortfall rule are removed.
Liquidation is atomic, inside the one command that pays.

### Liquidation order (C7, owner decision 2026-11-17)

**Definitions.**
- **Complete group:** one of the payer's groups that they wholly own:
  - a monopoly group;
  - all 4 logistics assets;
  - both energy assets.

  Mortgaged assets count toward completeness, as for doubling.
- **Current rent of an asset:** `rentFor(state, assetId, 7)` in the
  **current** state (dice sum 7 for energy; 0 when mortgaged). It is
  recomputed before every step, so mortgaging one logistics asset changes
  the order of the rest.
- **Asset order key:** `(current rent, price, assetId)`, ascending.

**Steps.**
- **Tier 1.** While cash < debt: mortgage the first asset by asset order
  key among the non-mortgaged, **bare** (0-house) assets outside complete
  groups.
- **Tier 2.** While cash < debt: mortgage the first asset by asset order
  key among the non-mortgaged bare assets inside complete groups.
- **Tier 3.** Run while cash < debt and any house remains. It covers every
  group with houses (complete, or left partial by an I1 expiry):
  1. **Choose the group:** the lowest group key `(Σ current rent of the
     group's built assets, Σ price of those assets, groupId)`. Built
     assets are those with houses; the price sum is the "cheapest built
     group" reading.
  2. **Inside the group,** sell one house from the most built asset (ties by
     asset order key).
  3. If that asset is now bare, mortgage it immediately, before any further
     sale.
  4. Repeat inside the same group until it has no houses, then choose the
     next group.

  After tier 2, every bare asset is already mortgaged, so tier 3 mortgages
  only the assets it strips.
- The stop condition is checked after every single step. If a sale covers
  the debt and leaves its asset bare, liquidation stops and that asset is
  **not** mortgaged.

**Why the order is total.** Every choice ends in `assetId` / `groupId`,
which are unique. The step-2 bankruptcy check guarantees that the tiers
cover the debt before every asset is exhausted.

**Events.** Each step emits its normal event with `auto: true`:
- `AssetMortgaged`, with `BalanceChanged` reason `mortgage`;
- `HouseSold`, with `BalanceChanged` reason `house-sale`.

Then `LiquidationApplied { payerId, creditorId, debt, cashBefore, raised,
steps: [{ tier, kind: 'mortgage' | 'sell-house', assetId, amount }] }`,
then the payment and `RentPaid`.

**Interpretation I6 (reported).** Tiers 1-2 consider only bare assets.
An asset with houses outside a complete group can exist only after an I1
expiry; it is reached in tier 3.


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
TASK-s5-core-mortgage (core-7 mortgage) ──> TASK-s5-core-debts ─┬─> TASK-s5-server ─┐
                                                                 └─> TASK-s5-client ─┴─> TASK-s5-e2e
```

- `TASK-s5-planner` (the exhaustive search) is superseded by revision 2 and
  stays parked. Its work is never merged.
- Core-debts starts after core-mortgage merges. It adds `settleDebt`, the
  tiered liquidation, bankruptcy and game end.
- Server and client run in parallel after core-debts. The server merges
  first and the client rebases.
- At most two Engineers at a time.

## Evidence plan

Per task: an independent review, and green CI on the exact head (`ci`,
`compose-browser`, `compose-browser-seeded`).

Effort completion (the handoff list):
- the 7 browser scenarios with 3 clients;
- liquidation order tests for every tier boundary, the immediate
  bankruptcy check and the stop condition;
- replay tests for the new rules;
- `openspec validate --all --strict`;
- green CI on the final main, with staging serving the final SHA;
- `ROADMAP.md` "Сделано".
