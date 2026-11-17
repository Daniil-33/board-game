# CTO -> Team Lead Effort Handoff

```yaml
id: EFF-stage-5-mortgage-debts-bankruptcy
revision: 2
project: economic-board-game
repo: github.com/Daniil-33/board-game
created_at: 2026-11-17T06:45:00Z
source_commit: dcd39b3 # plus the docs PR that adds this file
owner: cto
status: proposed
```

## Outcome

ROADMAP.md stage 5 "Ипотека, долги, банкротство и конец партии". Players can
mortgage and redeem assets. When a mandatory payment exceeds a player's cash,
the system raises the money itself in the least painful way. A player who
cannot pay is eliminated, and the last active player wins. From this stage a
game can be played to the end. The change runs through core, protocol, server
and client on top of stage 4 and replaces the stage 4 interim shortfall rule.

## Expected behavior and acceptance criteria

The owner agreed these rules. Sources: ROADMAP.md stage 5, including the owner
decisions of 2026-11-16, and GAME-BREAKDOWN.md § "Ипотека и расчёт долгов" and
§ "Банкротство". Money is integer quanta, `Q(x) = 10 × floor(x/10)`.

### Mortgage

1. **Taking a mortgage.** An owner may mortgage an asset that has no houses.
   - Houses on that asset must be sold first. Evenness still applies to the
     rest of the group.
   - The player receives the advance `Q(50% × price)` from the bank.
   - A mortgaged asset stays owned but brings no rent.
   - The stage 4 hooks apply: group doubling still counts mortgaged assets;
     count-based and dice-based holdings count only non-mortgaged ones; a
     group with a mortgage cannot be built on.
2. **Redeeming.** The owner pays exactly the advance received, with no
   premium, if their balance covers it. The asset brings rent again.
3. **When a player may mortgage or redeem.** Both are allowed under the same
   conditions as building in stage 4: own turn, no pending decision, no
   auction. Mortgaging and selling houses are also allowed during the player's
   own open rent settlement, so they can raise cash themselves before paying
   (owner confirmed 2026-11-17).
4. **Term.** A mortgage lasts 8 collective laps. One collective lap is
   complete when every active player has made one turn.
   - The Team Lead defines the exact counter, including how bonus turns and
     eliminations count, and states it in the design.
   - The counter belongs to the mortgage and moves with the asset (stage 7
     trades).
5. **Expiry.** If the asset is not redeemed by the end of the term, it becomes
   free (returns to the bank). The advance stays with the player and no debt
   arises.
   - The moment of expiry is a core event at the turn boundary.

### Debts and automatic liquidation

6. **Shortfall (owner decision 2026-11-17).** A mandatory payment (rent in
   this stage) is checked when it is paid (`PayRent` or the automatic
   payment):
   - if cash covers it, only cash is used;
   - if cash plus the resale of every house plus the advance of every asset
     that could be mortgaged (after its houses are sold) is below the debt, the
     player is bankrupt at once (criterion 9);
   - otherwise automatic liquidation raises money step by step and stops as
     soon as cash covers the debt.
7. **Liquidation order (owner decision 2026-11-17).** It uses no
   loss-minimizing search.
   - **Group.** A "complete group" is a monopoly group, all 4 logistics or both
     energy assets owned by the player.
   - **Tier 1.** Mortgage non-mortgaged assets outside complete groups.
   - **Tier 2.** Mortgage bare assets (no houses) inside complete groups.
   - **Tier 3.** Sell houses one at a time, keeping evenness: always from the
     most built asset of the group. As soon as an asset has no houses left,
     mortgage it before selling further.
   - **Order inside tiers 1 and 2:** lowest current rent first (dice-based
     assets at dice sum 7), then lower price, then stable asset id.
   - **Order between groups in tier 3:** start with the group whose houses
     bring the least rent (the cheapest built group), then lower price, then
     stable id.
   - **Tests.** Tests cover every tier boundary, the immediate-bankruptcy
     check, and that liquidation stops at the first step that covers the
     debt.
8. **No interaction.** Liquidation is automatic and atomic: the player is not
   asked. Every sale and mortgage is a core event, visible to all players.
   This replaces the stage 4 interim rule "pay the whole balance, the rest is
   written off".

### Bankruptcy and the end of the game

9. **Bankruptcy.** If even full liquidation cannot cover the debt, the player
   is bankrupt.
   - All houses are sold at the normal resale price.
   - The creditor receives `min(debt, cash + proceeds)`. The rest of the debt
     is written off, and the bank does not compensate.
   - All houses are removed, all mortgages are cleared, and every asset
     returns to the bank, free at its original price. Assets never pass to
     the creditor.
   - The player leaves the turn order permanently. Their turn closes.
   - There is only one creditor at a time (owner decision). Related trade
     offers do not exist yet (stage 7); leave a hook for them.
10. **Resignation.** A resigning player's assets now return to the bank free,
    as in a bankruptcy to the bank (stage 1 owner decision). This replaces the
    stage 4 interim rule "a resigned owner's assets bring no rent".
    - Stage 4 R1/R2 stay as they are: a rent settlement that is open when
      the payer or the owner resigns is dropped, and nothing is paid.
11. **Winner.** When one active player remains, they win and the game ends.
    This applies after bankruptcy as well as after resignation.
    - Game results are stored in the database: winner, order of elimination
      with reasons and times, and final balances.

### Visibility and interface

12. **Projection.** Every viewer sees:
    - mortgage state and remaining term of each asset;
    - every liquidation step and bankruptcy with its amounts;
    - eliminated players;
    - the game result.
13. **Client, functional only** (visual design is stage 8).
    - Vue: mortgage and redeem controls with reasons when disabled; mortgage
      state and term on the asset card; a liquidation summary shown to all
      players; an elimination screen for the eliminated player; a game-over
      screen with the results.
    - PixiJS: a mortgaged marker on cells.
14. **Recovery.** Server restart and tab reload preserve mortgages, their
    terms and the finished game result.
15. **Tests.** All new core rules have deterministic core tests, including
    replay and liquidation order tests. The stage 4 core
    RVW-002 is covered: rent paths with mortgaged assets.

## Scope and non-goals

In scope:
- `packages/game-core`: mortgage, term counter and expiry, liquidation
  search, bankruptcy, resignation disposition, game end;
- `packages/protocol`;
- `apps/server`: persistence and game results;
- `apps/client`: controls and screens;
- tests and browser scenarios.

Not in scope: credit of any kind (out of MVP); multi-creditor debts (they
cannot arise in MVP); casino, chance and the final jail rule (stage 6); trades
(stage 7); bots; visual design and localization (stage 8).

## Canonical sources

- `ROADMAP.md`: stage 5 with its owner decisions, and earlier owner decisions
  (stage 1 resignation, stage 4).
- `GAME-BREAKDOWN.md` § "Ипотека и расчёт долгов", § "Банкротство",
  § "Завершение игры и симуляция".
- `docs/efforts/stage-4-rent-building.md` (revision 2 in PR #52) and its
  design (`docs/efforts/stage-4-rent-building/`).
- `openspec/config.yaml`, `openspec/specs/` as accepted after stage 4.

## Architecture constraints

These are accepted and mandatory, unchanged from earlier stages:
- Headless deterministic core. Time and entropy come only from
  TransitionContext.
- The server is authoritative: clients send intents only and each viewer gets
  its own projection.
- One room per process, with commands executed sequentially.
- Persist before broadcast. Recovery is from a snapshot plus the log tail.
- The stack is as in ROADMAP.md.

`main` deploys to staging automatically and must stay deployable. Stored stage
4 games get a stated handling.

## Delegated and reserved decisions

The Team Lead decides:
- state and event shapes, command names, protocol shapes;
- the collective-lap counter and expiry representation, within criterion 4;
- how liquidation steps are represented as events, within criteria 6-7;
- the results storage schema;
- task order and test strategy.

Escalate to the CTO:
- any case these rules do not determine, for example a mortgage expiring
  while its asset is in a pending decision or auction;
- a liquidation case the order in criterion 7 does not determine.

## Dependencies, risks, and limits

- VM agents work only on branches with PRs; they never push to `main` and
  rebase on current `main` before a PR. A PR carrying a product decision is
  merged by the owner. Routine PRs merge after independent review and green
  CI.
- Codex is the default Engineer engine. Keep parallelism within usage limits.
- Agents never dispatch, approve or cancel a production deployment.

## Required Team Lead output

- Technical design: mortgage and term, collective lap, liquidation search and
  proof of optimality, bankruptcy and resignation disposition, game end and
  results, projection and protocol, stored-game handling.
- Task decomposition with ordering.
- Integration plan, evidence plan, focused escalations.

## Completion evidence

- CI is green on the final `main`, and `openspec validate --all --strict`
  passes. Staging runs the final `main`.
- Every PR has an independent review.
- Browser scenarios with 3 clients:
  1. Mortgage, then redeem.
  2. A mortgage expires after 8 collective laps and the asset becomes free.
  3. Rent above cash triggers automatic liquidation, shown to everyone,
     followed by payment.
  4. Bankruptcy to a player creditor: the creditor receives the partial
     amount and the bankrupt's assets become free.
  5. Resignation frees the resigned player's assets.
  6. The game reaches a winner, and the game-over screen survives a reload.
  7. Server restart with mortgages in place.
- Liquidation order tests for every tier.
- Replay test for the new core rules.
- ROADMAP.md "Сделано" is updated.

## Revision history

- 1: initial handoff.
- 2: owner decisions 2026-11-17: priority liquidation order replaces the
  loss-minimizing search (criteria 6-7); manual mortgage and house sale
  during one's own open rent settlement confirmed.

## Acceptance

The Team Lead records acceptance of this exact revision or returns exact gaps.
A material change creates a new revision.
