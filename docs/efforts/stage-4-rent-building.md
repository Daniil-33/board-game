# CTO -> Team Lead Effort Handoff

```yaml
id: EFF-stage-4-rent-building
revision: 2
project: economic-board-game
repo: github.com/Daniil-33/board-game
created_at: 2026-11-16T20:40:00Z
source_commit: 6a60bdc # plus the docs PR that adds this file
owner: cto
status: proposed
```

## Outcome

ROADMAP.md stage 4 "Рента и постройки": owning assets brings income. A
player who lands on another player's asset pays rent. On a complete group the
owner can build houses, which raise the rent. The change runs through core,
protocol, server and client on top of stage 3.

## Expected behavior and acceptance criteria

Agreed with the owner. Sources: ROADMAP.md stage 4 (including owner decisions
of 2026-11-16) and GAME-BREAKDOWN.md § "Активы, рента и строительство".
All amounts are rounded with `Q(x) = 10 × floor(x/10)` at the operation
boundary, with integer or exact rational arithmetic.

1. Regular assets (monopoly groups M1-M8):
   - with no houses, rent is `Q(5% × price)`;
   - if the owner holds the whole group, the no-house rent is doubled. The
     doubled amount is `2 × Q(5% × price)`; the Team Lead may pick the other
     rounding order but must state it in the design;
   - with 1/2/3/4 houses, rent is `Q(15/35/65/100% × price)`.
2. Logistics (count-based, 4 cells): rent is `Q(5/10/20/40% × price of the
   landed asset)` when the owner holds 1/2/3/4 logistics assets. No houses.
3. Energy (dice-based, 2 cells): rent is
   `Q(groupMeanPrice × movementDiceSum / 200 × activeHoldings)`.
   - `groupMeanPrice` is the mean price of the energy group;
   - `movementDiceSum` is the dice sum of the move that landed there;
   - `activeHoldings` is how many energy assets the owner holds.
   No houses.
4. Mortgage does not exist yet (stage 5). The rules that mention it must be
   built so stage 5 can plug in without a redesign:
   - a mortgaged asset brings no rent;
   - group doubling still counts mortgaged assets;
   - count-based and dice-based holdings count only non-mortgaged assets;
   - building requires no mortgage anywhere in the group.
5. Rent payment. Landing on an asset owned by another active player opens a
   mandatory rent settlement in the current turn. The payer pays with an
   explicit action. If the turn ends without it (`EndTurn` or turn
   deadline), it is paid automatically and the turn closes. The rent moves
   from the payer to the owner; both balance changes are core events.
6. No settlement (owner decision): landing on one's own asset, or rent equal
   to zero, opens nothing. Nothing is paid and no confirmation is needed.
7. Building:
   - a house costs `Q(50% × price of that asset)` and is paid to the bank;
     at most 4 houses per asset;
   - building requires the whole group owned with no mortgage;
   - building is even: house counts within the group never differ by more
     than one;
   - a player builds only during their own turn, with no pending decision,
     auction or settlement;
   - at most one new house per turn. A double's bonus turn is a new turn and
     allows one more house (owner decision 2026-11-16);
   - building is only allowed when the balance covers the cost.
8. Selling houses back to the bank:
   - a sale returns `Q(50% × the house's build cost)` to the player;
   - sales are also even;
   - one can sell during one's own turn, under the same conditions as building;
   - there is no limit on how many houses can be sold.
   Automatic sales during a shortfall are stage 5.
9. Projection: every viewer sees each asset's house count, the rent it would
   charge now (dice-based shown as a per-dice-point rate or formula), the
   pending rent settlement (payer, owner, amount) and every balance.
10. Client, functional only (visual design is stage 8):
    - Vue: a "Pay rent" action for the payer; build and sell controls on owned
      assets that enable only legal moves and give the reason when one is
      disabled; rent and houses on the asset card;
    - PixiJS: houses on cells and a simple rent payment animation.
11. Server restart and tab reload preserve houses, the per-turn build
    counter and a pending rent settlement with its deadline.
12. All new core rules have deterministic core tests, including replay and
    table tests for every rent formula and every N.

## Interim rules until stage 5 (CTO, to be replaced in stage 5)

- **Shortfall.** Stage 5 brings debts, automatic liquidation and bankruptcy.
  Until then, a payer whose balance is below the rent pays their whole
  balance and the rest is written off. The event records the full rent and
  the shortfall so stage 5 can replace this rule. Balances never go negative.
- **Resigned owner.** An asset whose owner has resigned brings no rent.
  Stage 5 returns such assets to the bank.
- **Resignation during an open rent settlement.** If the payer or the owner
  resigns before the rent is paid, the settlement is dropped and nothing is
  paid.

The owner confirmed these interim rules on 2026-11-16.

## Scope and non-goals

In scope: `packages/game-core` rent formulas, rent settlement, building and
selling, the per-turn build counter; `packages/protocol`; `apps/server`
deadlines and persistence; `apps/client` rent, build and sell controls and
house rendering; tests and browser scenarios.

Not in scope: mortgage, automatic liquidation, debts, bankruptcy and the end
of the game (stage 5); casino, chance and the final jail rule (stage 6);
trades (stage 7); visual design (stage 8).

## Canonical sources

- `ROADMAP.md` stage 4, owner decisions of stages 1-3, "Технические решения".
- `GAME-BREAKDOWN.md` § "Активы, рента и строительство", § "Ипотека и
  расчёт долгов" (house sale price only).
- `docs/efforts/stage-3-purchase-auction.md` and its design (ownership,
  pending decision, timer pause, target guards).
- `openspec/config.yaml`, `openspec/specs/` as accepted after stage 3 and the
  deploy effort.

## Architecture constraints

These are accepted and mandatory, unchanged from earlier stages:
- the core is headless and deterministic; time and entropy come from
  TransitionContext;
- the server is authoritative, clients send intents only, and each viewer gets
  their own projection;
- one room per process, commands run sequentially;
- persist before broadcast; recover from snapshot plus log tail;
- the stack is as in ROADMAP.md.

Staging deploys automatically from `main`, so `main` must stay deployable.
Stored stage 3 games get a stated handling (no production games exist).

## Delegated and reserved decisions

The Team Lead decides:
- state and event shapes, command names, protocol shapes;
- whether house counts and the build counter are stored or derived;
- the rounding order for the doubled rent (criterion 1);
- how stored stage 3 games are handled;
- task order and test strategy.

Escalate to the CTO: any case these rules do not determine. That includes
resignation of the payer or owner during an open rent settlement, beyond what
the interim rule above covers.

## Dependencies, risks, and limits

- VM agents work only on branches with PRs and never push to `main`; rebase
  on the current `main` before opening a PR.
- A PR carrying a product decision is merged by the owner. Routine PRs merge
  after independent review and green CI.
- Codex is the default Engineer engine. Keep parallelism within usage limits.
- Agents never dispatch, approve or cancel a production deployment.

## Required Team Lead output

- Technical design: rent calculation, settlement state and deadline, build
  and sell legality including evenness and the per-turn counter, projection
  and protocol, stored-game handling.
- Task decomposition with ordering.
- Integration plan, evidence plan, focused escalations.

## Completion evidence

- CI is green on the final `main`, and `openspec validate --all --strict`
  passes. The final `main` is deployed to staging automatically.
- Every PR has an independent review.
- Browser scenarios with 3 clients:
  - rent on an asset with no houses, then with a full group (doubled);
  - logistics rent with 2 holdings;
  - energy rent with the dice sum shown;
  - rent auto-paid at the turn deadline;
  - landing on one's own asset opens nothing;
  - building that respects evenness and one house per turn; an illegal build
    is rejected with a reason;
  - selling a house;
  - the interim shortfall pays the whole balance;
  - tab reload and server restart with a pending rent settlement.
- Replay test for the new core rules.
- ROADMAP.md "Сделано" is updated.

## Revision history

- 1: initial handoff.
- 2: owner decisions 2026-11-16: a double's bonus turn allows one more
  house (criterion 7); interim rules confirmed, resignation during an open
  rent settlement added.

## Acceptance

The Team Lead records acceptance of this exact revision or returns exact gaps.
A material change creates a new revision.
