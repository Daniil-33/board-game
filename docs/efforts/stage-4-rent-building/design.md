# Stage 4 rent and building: Team Lead technical design

Effort: `EFF-stage-4-rent-building`, handoff
`docs/efforts/stage-4-rent-building.md` revision 1 (docs PR #49), accepted by
the Team Lead on 2026-11-16 at main `6a60bdc`. Numbered criteria (C1..C12)
refer to the handoff. This document holds only the decisions delegated to
the Team Lead; product rules come from the handoff, `ROADMAP.md` stage 4 and
`GAME-BREAKDOWN.md` § "Активы, рента и строительство".

## Open product input

- **R (resignation during an open rent settlement)** escalated to the CTO on
  2026-11-16 (the handoff names it). Defaults, isolated in one core function
  `resignDuringRent`:
  - R1: the payer resigns, so the settlement is dropped and nothing is paid
    (consistent with the stage 2 "resigning balance unchanged");
  - R2: the owner resigns, so the settlement is dropped (interim rule
    "a resigned owner's asset brings no rent", applied at payment time).

  CTO answer (2026-11-16): the defaults R1/R2 are CTO interim rules until
  stage 5, pending owner confirmation; the core merged without a ROADMAP
  entry at the CTO's instruction.

## Delegated decisions

| Decision | Choice | Why |
|---|---|---|
| Rules version | `core-6`, sole supported version | New state, commands, settlement. |
| Protocol version | `PROTOCOL_VERSION = 4` | New commands with payloads and new view fields. |
| Stored stage 3 games | Migration `0005` closes every `lobby`/`playing` room (logs kept), as in stages 2-3 | No production games; staging rooms are disposable. |
| Doubled rent rounding (C1) | `2 × Q(5% × price)` (the handoff default) | Doubling a quantized amount stays quantized; simplest to explain. |
| Rent amount | Computed **at landing** and stored in the settlement | Nothing that changes rent can happen during the payer's turn in stage 4 (owners build only in their own turn; no trades or mortgage yet). Stage 5 keeps this. |
| Houses | Stored: `houses: Record<assetId, 1..4>` (absent = 0) | Source of truth; projected publicly. |
| Build counter | Stored in the existing `turn.quotas.builds`, reset to 1 at the start of **every** turn, bonus turns included (owner decision 2026-11-16, handoff r2; supersedes the r1 "full turn" interpretation) | No new state. |
| Mortgage hooks (C4) | `isMortgaged(state, assetId)` returns `false` in stage 4. Rent, doubling, holdings and build legality all go through it | Stage 5 plugs in without a redesign. |
| Settlement deadline | No separate deadline: the settlement lives inside the turn. `EndTurn` and the turn `Timeout` pay it automatically through `closeTurn`'s `settleMandatory` hook, then the turn closes | One timer; restart already restores the turn deadline (C11). |
| Turn timer during a settlement | Not paused | Nothing waits on other players. |
| Commands | `PayRent` (payload `null`, guard `turn`); `BuildHouse` and `SellHouse` (payload `{ assetId }`, guard `turn`) | The first payload-carrying player commands; the protocol validates `assetId` as a string, and the core validates everything else. |

## Core (`packages/game-core`)

### State

```ts
interface GameState {
  // existing ...
  /** Houses per asset id; absent = 0; values 1..4. */
  readonly houses: Readonly<Record<string, number>>;
  /** Mandatory rent of the current turn; null when none. */
  readonly rent: RentSettlement | null;
}
interface RentSettlement {
  readonly payerId: PlayerId;   // the turn owner
  readonly ownerId: PlayerId;
  readonly assetId: AssetId;
  readonly cell: number;
  readonly kind: 'regular' | 'logistics' | 'energy';
  readonly amount: Money;       // fixed at landing, > 0
  readonly diceSum: number | null; // energy only: the move's dice sum
}
```

### Rent formulas (C1-C3), integer arithmetic, `Q` at the boundary

- Regular, 0 houses: `base = Q(5·price/100)`; if the owner holds every asset
  of the group (mortgaged ones count, via `isMortgaged`) the rent is
  `2 × base`. With 1/2/3/4 houses: `Q(p·price/100)` for p = 15/35/65/100. A
  mortgaged asset brings 0.
- Logistics: `h` = the owner's non-mortgaged logistics assets;
  `Q(p·price/100)` for p = 5/10/20/40 at h = 1/2/3/4 (`price` of the landed
  asset).
- Energy: `Q(sumPrices(group) × diceSum × h / (200 × groupSize))` with
  `h` = the owner's non-mortgaged energy assets. This is the exact form of
  `groupMeanPrice × diceSum / 200 × h`.
- One pure function `rentFor(state, assetId, diceSum | null): Money` is
  shared by landing and projection. A projection of energy rent returns the
  formula inputs (see Projection).

### Landing (C5, C6)

After any forward move (including the interim jail release move), the
landing handler runs in this order:
1. a free asset opens the purchase decision (stage 3);
2. an asset owned by the mover, by a resigned owner, or with rent 0 does
   nothing;
3. otherwise it opens `rent` with the amount fixed now and emits
   `RentDue { payerId, ownerId, assetId, kind, amount, diceSum }`.

### Paying (C5, interim shortfall)

`settleRent(state, auto)`: `paid = min(amount, balance(payer))`,
`shortfall = amount − paid`. It emits `BalanceChanged` (payer −paid, reason
`rent`), `BalanceChanged` (owner +paid, reason `rent`, only when paid > 0)
and `RentPaid { payerId, ownerId, assetId, amount, paid, shortfall, auto }`,
then clears `rent`. `PayRent` calls it with `auto: false`. `closeTurn`'s
`settleMandatory` calls it with `auto: true` when a settlement is still
open (covers `EndTurn`, turn `Timeout` and every other closure). Balances
never go negative.

While `rent` is open:
- `BuildHouse` and `SellHouse` are rejected (`RENT_PENDING`);
- `RollDice` is impossible anyway, because the turn has already rolled;
- `EndTurn` pays and closes;
- `Resign` follows R.

### Building and selling (C7, C8)

`BuildHouse { assetId }` by the turn owner is legal only when all of these
hold:
- the phase is `playing` and it is the player's turn;
- there is no purchase decision, auction or rent;
- the asset is a monopoly asset owned by the player;
- the player owns the whole group;
- no asset in the group is mortgaged;
- the asset's houses are below 4;
- evenness holds: the asset's houses equal the group minimum;
- `turn.quotas.builds ≥ 1`;
- the balance is at least `cost = Q(50·price/100)`.

On success it debits `cost` (`BalanceChanged reason 'build'`), increments
the houses, decrements the quota and emits `HouseBuilt { playerId, assetId,
houses, cost }`.

`SellHouse { assetId }` uses the same turn, phase, pending and ownership
conditions; the asset has at least one house; evenness holds (the asset's
houses equal the group maximum); there is no quota. It credits
`refund = Q(50·cost/100)` (`BalanceChanged reason 'house-sale'`), decrements
the houses and emits `HouseSold { playerId, assetId, houses, refund }`.

Every rejection has a specific code (for example `NOT_OWNER`,
`GROUP_INCOMPLETE`, `GROUP_MORTGAGED`, `MAX_HOUSES`, `UNEVEN_BUILD`,
`BUILD_QUOTA_USED`, `INSUFFICIENT_FUNDS`, `NO_HOUSES`, `UNEVEN_SALE`,
`RENT_PENDING`, `DECISION_PENDING`, `AUCTION_IN_PROGRESS`, `NOT_A_BUILDABLE_ASSET`),
so the client can show the reason (C10). A pure helper
`buildLegality(state, playerId, assetId)` / `saleLegality(...)` returns the
same code without mutating. The client imports it as a display helper, and
the handlers use it, so the reason shown is always the reason the server
would give.

### Invariants

- `houses` keys are monopoly asset ids owned by an active or resigned
  player; values are 1..4.
- Houses only exist on groups wholly owned by one player.
- Within a group, house counts differ by at most 1.
- `rent` exists only in `playing`, for the turn owner, with `amount > 0`.
  It never exists together with `purchase` or `auction`.
- `turn.quotas.builds` is in 0..1.

### Projection (C9)

Public:
- `houses` and `rent` (the settlement, if any);
- every balance;
- `rentQuotes: Record<assetId, RentQuote>` for each owned asset, where
  `RentQuote = { kind: 'fixed', amount } | { kind: 'energy', sumPrices,
  groupSize, holdings }`.

The client shows energy as a formula and per-point rate with the display
helper `energyRentFor(quote, diceSum)` from game-core. A resigned owner's
asset and a mortgaged asset (from stage 5) quote 0.

### Events

`RentDue`, `RentPaid`, `HouseBuilt`, `HouseSold`; `BalanceChanged` reasons
gain `rent`, `build` and `house-sale`. All are public.

## Protocol (`packages/protocol`)

- `PROTOCOL_VERSION = 4`.
- `Command.type` gains `PayRent` (payload `null`), `BuildHouse` and
  `SellHouse` (payload `{ assetId: string }`, no extra keys, max length
  bounded).
- The view stays `Type.Unsafe<StateView>`.

## Server (`apps/server`)

- No new host contract. Rent has no own timer: the turn deadline from
  `pendingDeadlines` covers auto-payment.
- Restart and reload keep `houses`, `rent` and `turn.quotas` from the
  snapshot and log (C11).
- Migration `0005` closes `lobby`/`playing` rooms.
- **Test-only fixtures for browser evidence.** With `NODE_ENV=test` and
  `E2E_FIXTURES=1` only, an endpoint loads a predefined game state into a new
  room:
  - the state must pass core invariants;
  - it is persisted as the room's genesis snapshot;
  - it is refused otherwise, like `E2E_TEST_SEED`.

  The fixtures are defined in `e2e/` and built with core helpers. Production
  and staging never enable it.
- Integration tests:
  - rent over sockets, payer and owner balances on every guest;
  - auto-payment at the turn deadline;
  - build and sell with a rejection reason;
  - restart with an open settlement.

## Client (`apps/client`)

Functional only (C10):
- a "Pay rent" button for the payer while `view.rent` names them;
- a settlement line for everyone (payer, owner, amount);
- build and sell controls on the asset card for the owner. They are enabled
  from `buildLegality` / `saleLegality`, and a disabled control shows the
  reason code mapped to text;
- the asset card shows houses and the current rent quote, with energy as a
  formula;
- PixiJS: house markers per cell (1-4) and a simple rent payment animation
  (amount moving from payer to owner) on `RentPaid`. The animation is the
  only event-driven element; state always renders from the view.

## Tasks and order

```
TASK-s4-core ──┬─> TASK-s4-server (protocol v4 + server + test fixtures) ──┐
               └─> TASK-s4-client ──────────────────────────────────────────┴─> TASK-s4-e2e
```

- Core starts now; it may finish review before R is answered, and it merges
  after.
- Server and client start after the core merges, in parallel.
- The server merges first; the client rebases (stage 3 lesson).
- The e2e task starts after both have merged.
- At most two Engineers at once.

## Evidence plan

Per task: independent review, and green CI on the exact head (`ci`,
`compose-browser`, `compose-browser-seeded`).

Effort completion (handoff list):
- browser scenarios with 3 clients, built from test fixtures: rent without
  houses and on a full group (doubled); logistics with 2 holdings; energy
  with the dice sum; auto-payment at the deadline; landing on one's own
  asset opens nothing; even building, one house per turn, and an illegal
  build rejected with its reason; selling; interim shortfall; reload and
  restart with an open settlement;
- core replay and table tests for every formula and every N;
- `openspec validate --all --strict`;
- green CI on the final `main`, and staging deployed automatically with the
  final SHA;
- `ROADMAP.md` "Сделано" updated.
