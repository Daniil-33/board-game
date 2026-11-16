# Team Lead -> Engineer Task Handoff

```yaml
id: TASK-s2-client
revision: 1
effort: EFF-stage-2-field-money
project: economic-board-game
source_commit: <main after TASK-s2-core merges; set at delivery>
owner: team-lead
status: proposed
```

## Outcome

`apps/client` shows the stage 2 game functionally: the PixiJS board renders
the generated `CLASSIC_40` cells with names, group markers and prices, a Vue
player panel shows every player's live balance, and clicking an asset cell
opens an asset card.

## Acceptance criteria

Product (effort handoff criterion 11; visual design is stage 8):

1. Board: each of the 40 cells shows its label (company name for assets;
   Start / Jail / Casino / Go to jail / Chance for the others), a group
   marker distinct per `groupId` (M1..M8, logistics, energy) and the price for
   assets. Long names are truncated or wrapped legibly. No placeholder marker
   remains.
2. Player panel (Vue): every participant with nickname, balance, active-turn
   mark and eliminated mark; balances update on every `Update`, including the
   lap reward (an optional short "+N" hint driven by `BalanceChanged`).
3. Asset card (Vue): clicking an asset cell opens a card with company name,
   category, group (rank for monopolies), price, and the other members of the
   group with their prices and cells; it closes by a close control or Escape.
   Clicking a non-asset cell opens nothing.
4. The client renders only from the server view: no price, capital or reward
   computed locally.

Technical proof:

5. Component tests: player panel renders balances from a view and updates on a
   new view; asset card content and group members for a fixture board;
   non-asset click opens nothing; label/marker/price mapping per cell kind.
6. The mock server and fixtures use a generated stage 2 board (dev-only; it
   may call game-core's generator).
7. `pnpm build`, `pnpm test`, `vite build` pass.

## Scope and non-goals

In scope: `apps/client/**` (board, components, store, mock, tests), OpenSpec
client delta.

Not in scope: server or protocol changes, buying or any asset action, styling
beyond a clean usable layout, Playwright scenarios (`TASK-s2-e2e`), stage 1
client cosmetics.

## Canonical references

- `docs/efforts/stage-2-field-money.md` revision 1.
- `docs/efforts/stage-2-field-money/design.md` § "Client", § "Core" (state
  shape).
- `openspec/specs/client/*`.

## Constraints and invariants

The client never decides outcomes; it imports game-core only for types and
pure display helpers (dev mock excepted). All frames go through
`@game/protocol` decoders.

## Dependencies

Starts after `TASK-s2-core` merges; runs in parallel with `TASK-s2-server`,
which bumps `PROTOCOL_VERSION` to 2 in `packages/protocol`. Do not edit
`packages/protocol`; if your branch needs the bump before the server PR
merges, rebase on it when it lands. Report any shared file.

## Delegated decisions

Component structure, marker colours/shapes, card placement, label truncation,
test helpers. Return to the Team Lead before changing view consumption
contracts or adding client-side game logic.

## Required workflow

Explore -> Propose (OpenSpec change, proposal checkpoint reported with
`agentctl engineer report --wake`) -> Team Lead approval -> Apply -> Verify ->
PR -> Review fixes. Archive the OpenSpec change in the PR once review passes.

## Required checks

`pnpm build`, `pnpm test`, `vite build`, a manual run against the mock with a
screenshot of the board, panel and card attached to the report,
`openspec validate --all --strict`, `git diff --check`, green CI on the PR
head.

## Escalation conditions

Missing data in the view for a required display; a product question on what
to show; a needed protocol or core change.

## Deliverables

OpenSpec change, code and tests, branch `agent/task-s2-client`, PR, CI
evidence, screenshots, independent review report, residual risks.

The Engineer accepts the exact revision before editing. A material change
creates a new revision.
