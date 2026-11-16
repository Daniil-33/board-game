# CTO -> Team Lead Effort Handoff

```yaml
id: EFF-stage-2-field-money
revision: 1
project: economic-board-game
repo: github.com/Daniil-33/board-game
created_at: 2026-11-16T01:45:00Z
source_commit: 87d51b2 # plus the docs PR that adds this file
owner: cto
status: proposed
```

## Outcome

ROADMAP.md stage 2 "Поле и деньги": the real `CLASSIC_40` board with
generated asset composition and fixed prices replaces the stage 1 placeholder
ring; players have money; passing start pays the lap reward. The change runs
through every layer (core, protocol, server, client) on top of the stage 1
skeleton. No asset can be bought yet (stage 3).

## Expected behavior and acceptance criteria

Agreed with the owner. Sources: ROADMAP.md stage 2 and
`docs/proposals/stage-2-asset-catalog.md` (accepted 2026-11-14).

1. Layout. The board is `CLASSIC_40` exactly as in the proposal section
   "Раскладка `CLASSIC_40`": corners 0 Start, 10 Jail, 20 Casino, 30 Go to
   jail; ranked monopolies M1-M8 (`2 + 6×3 + 2`), 4 logistics, 2 energy and 8
   chance cells on the listed indices. The layout is identical in every game
   and for every player count. The stage 1 `PLACEHOLDER_RING` and its
   placeholder markers are removed.
2. Catalog. The catalog of the proposal section "Каталог" (10 regular
   categories, 6 logistics, 4 energy companies, names exactly as written) is a
   separate versioned data file, so names can be replaced later without
   changing logic. The catalog version is stored with each game.
3. Prices. The price table of the proposal section "Получившаяся таблица"
   (S = 56 740) is a versioned constant in the core, not computed with
   floating point at run time. Price depends only on cell position: every
   asset of rank r costs `B_r`, the last asset of a monopoly by cell index
   costs `1.1 × B_r` (the values listed in the table); logistics 1780 each,
   energy 1330 each. Prices are fixed for the whole game.
4. Generation. When a game is created the composition is generated: 8 of the
   10 categories are chosen at random and randomly assigned ranks M1-M8 (no
   thematic constraints, each category at most once); for each monopoly as
   many companies as it has cells (2 or 3) are chosen from its category in
   random order; logistics 4 of 6 and energy 2 of 4, random choice and order.
   Generation is deterministic from game entropy supplied by the server
   through the transition context, the generator version and the generated
   result are stored with the game, and replay of the log reproduces the same
   board.
5. Starting capital. At game start every player receives the same capital
   `C = Q(α × S / N)` with exact rational `α = 600/569`, `S = 56 740` and `N`
   the number of players at start: 29 910 / 19 940 / 14 950 / 11 960 / 9 970
   for N = 2..6. Integer or exact rational arithmetic only; money is integer
   quanta `Q(x) = 10 × floor(x/10)`.
6. Lap reward `Q((2/15) × C)` (3 980 / 2 650 / 1 990 / 1 590 / 1 320) is paid
   when a forward move passes start or lands exactly on it, once per
   crossing. No reward on a move backward or on transfer to jail (including
   the third double, which goes to jail before movement). The reward is paid
   before settlement of the landing cell (stage 1 settlement hook).
7. Balances are integers and never negative; this is a core invariant. Every
   balance change is a core event.
8. Landing effects in this stage: none. Landing on an asset, chance, casino or
   "Go to jail" (30) has no effect until stages 3 and 6; landing on Jail (10)
   is a visit. The stage 1 interim jail rule is unchanged.
9. Projection. Every viewer sees the full board (index, cell kind, category,
   company name, rank/group, price) and every player's balance. Data that
   could help predict future dice is never projected.
10. Protocol carries the board and balances; the protocol version and the core
    rules version are bumped. Handling of games stored under the stage 1
    rules version is a Team Lead decision and must be stated in the design
    (there are no production games; the owner preview database exists).
11. Client, functional only (visual design is stage 8): PixiJS board shows
    each cell's name, group marker and price; a Vue player panel shows every
    player's balance, updated live, including the lap reward; clicking an
    asset cell opens an asset card (company, category, price, other members of
    its group).
12. Server restart and tab reload preserve the generated board and balances.
13. All new core rules have deterministic core tests, including replay and a
    test that the price table, S, C(N) and reward(N) match the proposal.

## Scope and non-goals

In scope: `packages/game-core` board, catalog data, generation, prices, money
and lap reward; `packages/protocol`; `apps/server` persistence of the new
state; `apps/client` board labels, player balances and asset card; tests and
browser scenarios.

Not in scope: buying, auction, rent, building (stages 3-4); mortgages, debts,
bankruptcy (stage 5); casino, chance, final jail and the "Go to jail" cell
(stage 6); trades (stage 7); credit limit (out of MVP, owner decision
2026-11-14); visual design and stage 1 deferred items (stage 8); trademark
review of the catalog (before public release).

## Canonical sources

- `ROADMAP.md` stage 2 and "Технические решения".
- `docs/proposals/stage-2-asset-catalog.md` (catalog, price formula and table,
  layout, generation, reward order).
- `GAME-BREAKDOWN.md` § "Участники и поле", § "Начальная настройка и деньги",
  § "Движение, круг и награда".
- `openspec/config.yaml`, `openspec/specs/` (engine, protocol, server, client,
  deployment) as accepted after stage 1.
- Owner voice evidence:
  `/srv/agent-runtime/state/inbox/VOICE-20261114T170400766273Z-85f1e5/transcript.txt`.

## Architecture constraints

Accepted (mandatory), unchanged from stage 1:

- Headless deterministic core: no UI, server, DB, network, timers or global
  random in `game-core`; time and entropy come through TransitionContext.
- Server is authoritative; clients send intents only and receive their own
  projection. One room per process, commands sequential.
- Write order: core executes, accepted command is persisted, then updates are
  broadcast. Recovery from snapshot plus log tail.
- Stack as in ROADMAP.md "Технические решения".

## Delegated and reserved decisions

Team Lead decides: representation of board, catalog and price data, generator
algorithm and its versioning, event shapes, protocol shapes, handling of
stored stage 1 games, task order, test strategy.

CTO interpretations in this handoff (escalate if they block the design):
balances are public (ROADMAP "панель игроков с балансами"); special cells and
assets are inert until their stages.

Reserved to the owner (escalate via CTO): any product rule not listed above,
any change to catalog names, prices or layout.

## Catalog verification (CTO, 2026-11-16)

Names stay exactly as accepted; implementers do not edit them. Notes for the
owner, not blocking because names live in a replaceable data file:

- Grammarly: the parent company was renamed Superhuman in October 2025; the
  Grammarly product brand continues.
- Datagroup-Volia: owned with lifecell by NJJ Holding since September 2024
  (group branded DVL); the Volia brand may be retired.
- Microfinance brands were not independently verified against the NBU register.

## Dependencies, risks, and limits

- VM agents work only on branches with PRs; never push to `main`. The owner
  develops locally in parallel; rebase on current `main` before PR.
- A PR that contains a product decision is merged by the owner; routine PRs
  merge after independent review and green CI.
- Codex is the default Engineer engine. Claude sessions run on
  `claude-opus-5-5`; keep Engineer parallelism within current usage limits.
- Deployment stays on the VPS bound to localhost.

## Required Team Lead output

Technical design (board/catalog/price data, generation and entropy, money
state and events, projection and protocol changes, stored-game handling),
task decomposition with ordering, integration plan, evidence plan, focused
escalations.

## Completion evidence

- CI green on the final `main`; `openspec validate --all --strict` passes.
- Independent review of every PR.
- Scenario evidence: games with 2 and 3 browser clients show the same
  generated board to every player and start balances equal to C(N); two new
  games differ in composition; a move passing start credits the reward and
  every client sees it; third double to jail credits nothing; server restart
  and tab reload keep board and balances.
- Replay test for the new core rules.
- ROADMAP.md "Сделано" updated.

## Revision history

- 1: initial handoff.

## Acceptance

The Team Lead records acceptance of this exact revision or returns exact gaps.
A material change creates a new revision.
