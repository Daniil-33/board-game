# Team Lead -> Engineer Task Handoff

```yaml
id: TASK-s2-core
revision: 1
effort: EFF-stage-2-field-money
project: economic-board-game
source_commit: c31435312911c6cb622e26e4559b46ea8e39a327
owner: team-lead
status: proposed
```

## Outcome

`packages/game-core` runs stage 2 rules under rules version `core-4`: the
real `CLASSIC_40` layout, the versioned `ua-1` catalog, the `prices-1` price
table, deterministic board generation `gen-1` at `CreateGame`, starting
capital at `StartGame`, the lap reward on forward start crossings, balances as
a public core invariant, and removal of the stage 1 placeholder ring.

## Acceptance criteria

Product (effort handoff criteria 1-9 and 13, unchanged in meaning):

1. `CLASSIC_40` matches the proposal section "Раскладка `CLASSIC_40`" cell by
   cell; it is the same for every game and player count. `PLACEHOLDER_RING`
   and every placeholder marker are gone from game-core.
2. The catalog lives in `src/catalog/ua-1.json` with the proposal's 10
   categories, 6 logistics and 4 energy companies, names byte-for-byte as in
   the proposal (do not edit, translate or normalize them). The game stores
   `board.catalogVersion`.
3. Prices come from a constant table equal to the proposal's "Получившаяся
   таблица"; the last asset of each monopoly by cell index has the higher
   price; logistics 1780, energy 1330; no floating point at run time.
4. `CreateGame` generates the board with `gen-1` exactly as specified in the
   design; `board.generatorVersion` and the resolved cells are stored; replay
   of the log reproduces the identical board; different seeds or entropy give
   different compositions.
5. `StartGame` credits every player `C(N)` (29 910 / 19 940 / 14 950 /
   11 960 / 9 970 for N = 2..6) and fixes `economy.lapReward` (3 980 / 2 650 /
   1 990 / 1 590 / 1 320).
6. A forward move that passes or lands on cell 0 credits the reward once,
   after `PlayerMoved` and before any landing settlement. The third double
   (`SentToJail`) credits nothing. The interim jail release move follows the
   normal movement rule. Landing on any cell has no effect.
7. Balances are non-negative integer quanta; every change emits
   `BalanceChanged`; a violation is an `InvariantViolationError`.
8. Projection exposes `board`, `economy` and `balances` to every viewer;
   `rng` stays secret.

Technical proof:

9. Data tests: layout counts and indices; catalog matches the proposal (names,
   counts, unique ids); price table equals the proposal and sums to 56 740;
   `C(N)` and `reward(N)` equal the proposal for N = 2..6; last-by-index rule.
10. Generator tests: a golden board for a fixed seed and entropy; every
    generated board satisfies the `board-shape` invariant across many seeds
    (property test); distribution sanity (each category and company appears
    over many seeds).
11. Movement tests: crossings from 39, 35, 30 etc. by 2..12; exact landing on
    0; no reward on third double; reward on interim jail release only if the
    move crosses (it cannot from cell 10 with 2d6; assert no reward).
12. Replay: existing replay/golden/property suites updated to `core-4` and
    extended with board and balances; `restoreSession` from a mid-game
    snapshot reproduces board and balances.
13. Projection and visibility tests updated for the new fields and events.

## Scope and non-goals

In scope: `packages/game-core/src/**`, its tests, the OpenSpec change
(engine spec deltas). Minimal mechanical updates outside game-core only where
the build breaks on a removed export (for example a client import of
`PLACEHOLDER_RING`): replace with the nearest `CLASSIC_40` equivalent and
nothing more; report each such edit.

Not in scope: protocol version bump, server migration, client UI (sibling
tasks); buying, rent, auction, building, mortgage, bankruptcy, casino,
chance, the "Go to jail" cell, final jail rules, trades; resignation money
rules.

## Canonical references

- `docs/efforts/stage-2-field-money.md` revision 1.
- `docs/efforts/stage-2-field-money/design.md` § "Core".
- `docs/proposals/stage-2-asset-catalog.md` (catalog, table, layout,
  generation, reward order).
- `ROADMAP.md` stage 2; `GAME-BREAKDOWN.md` § "Участники и поле",
  § "Начальная настройка и деньги", § "Движение, круг и награда".
- `openspec/config.yaml`, `openspec/specs/engine/*`.

## Constraints and invariants

Headless deterministic core: no I/O, timers, clock or global random; entropy
only via `TransitionContext`. Integer money only (`Q`). A rejected command
never mutates state or consumes randomness. One revision per accepted command.
The generator draw order in the design is a contract: any deviation needs a
new generator version and Team Lead approval.

## Dependencies

None upstream (main `c314353`). `TASK-s2-server` and `TASK-s2-client` start
after this merges and depend on the exported names in the design
(`CLASSIC_40`, `GeneratedBoard`, `BoardCell`, `BoardAsset`, `BalanceChanged`,
`BoardGenerated`, `CURRENT_RULES_VERSION = 'core-4'`). Changing any of them
returns to the Team Lead.

## Delegated decisions

Module split inside game-core, internal helpers, catalog slug spelling, test
layout, exact `BoardGenerated` payload extras. Return to the Team Lead before
changing the state shape, event names or generator algorithm in the design.
Any product rule not covered above goes to the Team Lead; do not guess.

## Required workflow

Explore -> Propose (OpenSpec change, proposal checkpoint reported with
`agentctl engineer report --wake`) -> Team Lead approval -> Apply in a fresh
context -> Verify -> PR -> Review fixes. Archive the OpenSpec change in the
PR once review passes.

## Required checks

`pnpm build`, `pnpm test`, the new data/generator/movement/replay tests,
`openspec validate --all --strict`, `git diff --check`, green CI on the PR
head.

## Escalation conditions

A proposal value that does not reproduce (table, S, C, reward); a catalog
name that cannot be encoded as written; a case the rules do not cover; a
needed change to an accepted spec beyond stage 2; inability to prove a
criterion deterministically.

## Deliverables

OpenSpec change, code and tests, branch `agent/task-s2-core`, PR, CI
evidence, independent review report, residual risks.

The Engineer accepts the exact revision before editing. A material change
creates a new revision.
