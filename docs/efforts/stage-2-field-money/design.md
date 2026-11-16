# Stage 2 field and money: Team Lead technical design

Effort: `EFF-stage-2-field-money`, handoff `docs/efforts/stage-2-field-money.md`.
Revision 1 accepted by the Team Lead on 2026-11-16 at main `c314353`.

This document holds the technical decisions delegated to the Team Lead. It does
not change product behavior; product rules come only from the handoff,
`ROADMAP.md` stage 2, `docs/proposals/stage-2-asset-catalog.md` and
`GAME-BREAKDOWN.md`. Numbered criteria (C1..C13) refer to the handoff.

## Verified arithmetic (Team Lead, 2026-11-16)

- The proposal's price table sums to `S = 56 740` (22 monopoly assets 46 960,
  logistics 4 × 1780, energy 2 × 1330).
- `C(N) = 10 × floor(600 × S / (569 × N × 10))` gives 29 910 / 19 940 /
  14 950 / 11 960 / 9 970 for N = 2..6.
- `reward(N) = 10 × floor(2 × C(N) / 150)` gives 3 980 / 2 650 / 1 990 /
  1 590 / 1 320.
- The layout lists 22 monopoly cells (sizes 2,3,3,3,3,3,3,2), 4 logistics,
  2 energy, 8 chance and 4 corners. Every catalog category has at least 4
  companies, so a rank of 3 cells can always be filled.

All of these are pinned by core tests (C13).

## Delegated decisions

| Decision | Choice | Why |
|---|---|---|
| Rules version | `core-4`; `SUPPORTED_RULES_VERSIONS = ['core-4']` | The RNG stream, state shape and transitions change. |
| Protocol version | `PROTOCOL_VERSION = 2` | The view and event set change. |
| Stage 1 stored games | Not supported. Migration `0003` sets `status = 'closed'` on every room in `lobby` or `playing`; stage 1 logs stay in the DB untouched. Opening any `core-3` game yields the existing failed-room path (`ROOM_UNAVAILABLE`), never a crash. | No production games exist; keeping a second rules engine for the owner's preview DB costs more than it is worth. |
| Catalog format | JSON data file `packages/game-core/src/catalog/ua-1.json`, version `ua-1`, loaded and validated by `catalog.ts` | Names are replaceable without touching logic (C2). |
| Price table | TypeScript constant `PRICE_TABLE` with version `prices-1` in `packages/game-core/src/board/prices.ts`; integer literals copied from the proposal, no runtime formula | C3; determinism does not depend on floating point. |
| Generator | `gen-1`, specified below | C4. |
| Board in state | Fully resolved board (names, categories, prices) stored in `GameState.board` | A stored game stays self-contained even if the catalog file changes later; replay recomputes and compares it. |
| Balance events | One generic event `BalanceChanged` with a `reason` | C7; later stages add reasons instead of new event families. |

## Core (`packages/game-core`)

### Static data

- `board/classic40.ts`: `CLASSIC_40`, a frozen 40-cell layout exactly as in
  the proposal section "Раскладка `CLASSIC_40`". Cell kinds:
  `start | jail | casino | go-to-jail | chance | monopoly | logistics | energy`;
  monopoly cells carry `rank` 1..8. Exports `size = 40`, `startCell = 0`,
  `jailCell = 10`.
- `board/prices.ts`: `PRICE_TABLE` (`version: 'prices-1'`): price per rank
  position (`B_r` for every asset of a rank except the last by cell index,
  which takes the listed `1.1 × B_r` value), logistics 1780, energy 1330, and
  `S = 56 740` as a constant checked against the table sum by a test.
- `catalog/ua-1.json`: `{ version, categories: [{ id, name, companies: [{ id,
  name }] }], logistics: [{ id, name }], energy: [{ id, name }] }`. Category
  and company ids are stable ASCII slugs, unique across the whole catalog;
  names are exactly the proposal's strings. Category order and company order
  are the proposal's order (the generator depends on it).
- `money.ts`: `startingCapital(N)` and `lapReward(capital)` in integer
  arithmetic as above; `Q` stays.

### Generator `gen-1`

Run inside `CreateGame` on the state RNG after the existing per-command
entropy absorption, so replay of the log reproduces it. `shuffle` is
Fisher–Yates from the top: for `i = n-1 .. 1`, `j = nextIntInclusive(rng, 0, i)`,
swap `i` and `j`. Draw order is fixed:

1. Shuffle the 10 category ids (catalog order); the first 8 get ranks 1..8.
2. For rank 1..8 in order: shuffle that category's companies (catalog order),
   take the first `size(rank)` and assign them to the rank's cells in
   ascending index order.
3. Shuffle the 6 logistics companies; the first 4 go to cells 5, 15, 25, 35.
4. Shuffle the 4 energy companies; the first 2 go to cells 12, 28.

Any change to this order or algorithm is a new generator version and a new
rules version.

### State

```ts
interface GameState {
  // existing fields ...
  /** Generated board; non-null from CreateGame on. */
  readonly board: GeneratedBoard | null;
  /** Fixed at StartGame; null before. */
  readonly economy: { readonly startingCapital: Money; readonly lapReward: Money } | null;
  /** Balance of every participant from StartGame on; empty before. */
  readonly balances: Readonly<Record<string, Money>>;
}

interface GeneratedBoard {
  readonly layout: 'CLASSIC_40';
  readonly catalogVersion: string;      // 'ua-1'
  readonly priceTableVersion: string;   // 'prices-1'
  readonly generatorVersion: string;    // 'gen-1'
  readonly cells: readonly BoardCell[]; // 40, index order
}

interface BoardCell {
  readonly index: number;
  readonly kind: CellKind;
  readonly asset: BoardAsset | null;    // non-null exactly for monopoly/logistics/energy
}

interface BoardAsset {
  readonly assetId: AssetId;            // = company id (unique per game)
  readonly name: string;
  readonly categoryId: string;          // monopoly category, or 'logistics' / 'energy'
  readonly categoryName: string;
  readonly groupId: string;             // 'M1'..'M8', 'logistics', 'energy'
  readonly rank: number | null;         // 1..8 for monopolies
  readonly price: Money;
}
```

The catalog version is stored as `board.catalogVersion` (C2); the generator
version and result as `board.generatorVersion` and `board.cells` (C4).

### Transitions

- `CreateGame`: as today, then generate the board; events `GameCreated`,
  `BoardGenerated { layout, catalogVersion, priceTableVersion, generatorVersion }`.
- `StartGame`: `N = players.length`; set `economy`; credit every player
  `startingCapital(N)`; events `GameStarted`, then one
  `BalanceChanged { playerId, delta, balance, reason: 'starting-capital' }`
  per player in join order, then the existing order-roll events.
- Movement (`movePlayer`, used by the normal roll and the interim jail
  release): a forward move with `from + steps >= 40` credits
  `economy.lapReward` once, as `BalanceChanged { reason: 'lap-reward' }`
  immediately after `PlayerMoved` and before any landing settlement (C6).
  `SentToJail` (third double) does not move through `movePlayer` and pays
  nothing. Landing on any cell has no effect (C8).
- Resignation: balances are not changed and the eliminated player's entry is
  kept (no money moves, so no event). What happens to a resigning player's
  money is a later-stage rule (stage 5); stage 2 does not decide it.

### Invariants

- `board-shape`: `board` null exactly in `uninitialized`; 40 cells whose kinds
  and ranks match `CLASSIC_40`; asset present exactly on asset cells; prices
  equal `PRICE_TABLE`; asset ids unique; each monopoly group drawn from one
  category; the 8 monopoly categories distinct.
- `balances`: every value a non-negative safe integer multiple of 10 (C7);
  keys are exactly all participants (including eliminated) in
  `setup | playing | finished`, empty before; `economy` non-null exactly when
  balances are non-empty.
- `ring-position` uses `CLASSIC_40.size`.

### Projection

`board`, `economy` and `balances` are `public`; `rng` stays `secret` (C9).
`BoardGenerated` and `BalanceChanged` are public events. Nothing derived from
the RNG state is added to the view.

### Removal

`PLACEHOLDER_RING`, its types and placeholder markers are deleted (C1); the
interim jail rule keeps using `CLASSIC_40.jailCell`.

## Protocol (`packages/protocol`)

`PROTOCOL_VERSION = 2`. `StateViewSchema` stays `Type.Unsafe<StateView>` (the
TypeScript type follows game-core); its description is updated for board,
economy and balances. A version 1 `Hello` is rejected with
`PROTOCOL_VERSION_UNSUPPORTED` as today.

## Server (`apps/server`)

- `CreateGame` already carries the server seed and per-command entropy; no
  new inputs.
- Migration `0003_stage2_rules.sql` closes stage 1 rooms (decision above).
- Recovery and snapshots need no format change: board, economy and balances
  are plain JSON in the state snapshot. Tests prove restart keeps them
  (C12).
- `E2E_TEST_SEED` remains the deterministic hook; seed values chosen for
  stage 1 scenarios no longer produce the same dice and are re-chosen in the
  e2e task.

## Client (`apps/client`)

Functional only (C11). Board geometry stays the 11-per-side square. Each cell
shows its name (or corner/chance label), a group marker (one distinct marker
per `groupId`) and the price for assets. A Vue player panel lists every
participant with nickname, balance and active/eliminated state, updated from
each `Update` view; `BalanceChanged` events may drive a short "+N" hint. A
click on an asset cell opens a Vue asset card: company, category, group,
price and the other members of the group with their prices. The mock server
uses a generated board fixture.

## Tasks and order

```
TASK-s2-core ──┬─> TASK-s2-server (protocol + server) ──┐
               └─> TASK-s2-client ──────────────────────┴─> TASK-s2-e2e
```

At most two Engineers run at once (server and client in parallel). Each task
has its own handoff in `tasks/`, its own OpenSpec change archived in its PR,
and an independent review of the exact commit range.

## Evidence plan

Per task: green CI on the PR head, independent review, the task's focused
checks. Effort completion (handoff "Completion evidence"): Playwright with 2
and 3 clients (same board for all, balances equal to C(N), two games differ in
composition, a start crossing credits the reward seen by every client, a
seeded third double credits nothing, server restart and tab reload keep board
and balances), core replay and data tests, `openspec validate --all --strict`,
green CI on final `main`, `ROADMAP.md` "Сделано" updated.
