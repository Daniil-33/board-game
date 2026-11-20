# CTO -> Team Lead Effort Handoff

```yaml
id: EFF-stage-6-special-cells
revision: 1
project: economic-board-game
repo: github.com/Daniil-33/board-game
created_at: 2026-11-20T07:20:00Z
source_commit: 3f59c5e # plus the docs PR that adds this file
owner: cto
status: proposed
```

## Outcome

ROADMAP.md stage 6 "Особые клетки": casino, chance and the final jail rule,
plus the owner rule of 2026-11-19 that limits asset actions to the player's own
turn. Today the casino, chance and "В тюрьму" cells do nothing, and jail uses
the interim stage 1 rule with no fees (the stage 1 jail-attempt implementation).
After this effort, every cell on `CLASSIC_40` has its final MVP effect. The
change runs through core, protocol, server and client. The client is built
directly in the accepted visual design (EFF-visual-design, accepted 2026-11-20
at 3f59c5e).

## Expected behavior and acceptance criteria

The owner agreed these rules. Sources:
- ROADMAP.md stage 6, with the owner decisions of 2026-11-16 and 2026-11-19;
- GAME-BREAKDOWN.md § "Особые клетки и события";
- `docs/design/ui-brief.md` § 6.6.

Money is integer quanta, `Q(x) = 10 × floor(x/10)`. `initialCash` and the lap
`reward` are the values the game already computes. Percentages use integer arithmetic,
`Q(initialCash × p / 100)`, never floating point.

Criteria marked **[CTO]** are CTO interpretations of rules the owner left
implicit. They are listed in the PR for the owner. If the owner changes one,
it becomes a new revision.

### Casino (cell 20)

1. **Bet.** A player who lands on the casino may place one optional bet,
   once per landing.
   - The bet is a whole number of quanta.
   - **[CTO]** The bet must be at least 10 and at most
     `min(Q(10% × initialCash), the player's cash)`. There is no credit.
   - Skipping, `EndTurn` or the turn deadline means no bet.
2. **Outcome.** The game draws win or lose with probability 50% each, using
   the core RNG with entropy from TransitionContext. A win credits the bet
   from the bank, and a loss debits the bet to the bank. The result is a core
   event that every player sees.
3. **Blocked while a payment is open.** No bet while the player has an open
   mandatory payment. Landing on the casino creates no payment itself. The
   rule guards against carried-over states, such as a bonus-turn landing.

### Chance (8 cells)

4. **Draw.** Landing on a chance cell draws one of four effects with equal
   probability: +5%, −5%, +10% or −10% of `initialCash`, each amount `Q()`.
   It uses the core RNG. The drawn card is a core event that every player
   sees.
5. **Gain.** A positive card is credited from the bank at once.
6. **Loss. [CTO]** A negative card is a mandatory payment to the bank. It
   follows the stage 4-5 rent settlement rules:
   - the player pays it with the settlement payment command, or it is paid
     automatically at `EndTurn` or the turn deadline;
   - during it the player may mortgage or sell houses manually;
   - a shortfall runs the stage 5 automatic liquidation in the owner's
     priority order;
   - if even full liquidation cannot cover it, the player goes bankrupt to
     the bank. The bank receives `min(debt, cash + proceeds)` and assets
     return to the bank free, as in a stage 5 bankruptcy with a single
     creditor.

### Jail (cells 10 and 30)

7. **Going to jail.** A player goes to jail in two ways:
   - by landing on "В тюрьму" (cell 30);
   - by a third double in a row (unchanged from stage 1).

   The player moves to cell 10 directly, with no lap reward. The doubles
   streak resets and the turn ends. **[CTO]** No bonus turn is granted, even
   when the move to cell 30 came from a double. This matches the third-double
   rule.
8. **Visiting.** Landing on cell 10 by a normal move is only a visit, with no
   effect.
9. **Exit (owner 2026-11-16).** On each of up to three of their own turns, the
   prisoner chooses before rolling:
   - **Roll for a double.** A double releases the player, who moves by the sum
     of the dice. **[CTO]** That double grants no bonus turn, the same as the
     interim rule. A failed roll keeps the player in jail and the turn
     continues without movement: building, mortgaging and the other own-turn
     actions are still allowed.
   - **Pay and leave.** The player pays the bank the exit fee
     `Q(reward / 4)` (990, 660, 490, 390 or 330 for 2-6 players), then rolls
     and moves normally. A double on that roll follows the normal doubles
     rules.
   - **After the third failed roll** the player must pay the fee and move by
     that roll's sum.
   - **[CTO] The fee is settled when it falls due, before any move**
     (TL J1, option A). Unlike criterion 6, it never waits for the end of
     the turn.
     - **Voluntary exit** is offered only when cash covers the fee.
       Otherwise the reason is shown. The player may first mortgage or sell
       on their own turn (criterion 13), then pay.
     - **Forced fee after the third failed roll.** If cash covers the fee, it
       is debited at once. Otherwise the stage 5 automatic liquidation runs
       at once, in the owner's priority order, then the fee is paid and the
       player moves. There is no manual window for this fee.
     - **Bankruptcy.** If even full liquidation cannot cover the fee, the
       player goes bankrupt to the bank, as in criterion 6, and does not
       move.
10. **Deadline.** If the turn deadline arrives before the prisoner acts, the
    existing forced roll counts as the roll-for-a-double choice. A voluntary
    exit is never automatic.
11. **Rights in jail.** A prisoner still owns their assets, receives rent and
    may trade (stage 7). Asset actions follow criteria 12-13 on their own
    turns.
12. **Replace the interim rule.** jail-attempt code and the old jail events and
    their "temporary" markers in the code and protocol are removed. Games
    stored with the prior jail state get a handling stated in the design.
    For example, a prisoner keeps their attempts used and the final rules
    apply from the next turn.
    Logs already stored with the former jail events keep recovering and replaying,
    through a legacy read path or a one-time snapshot migration. New
    transitions never use the interim rule.

### Asset actions only on the player's own turn (owner 2026-11-19)

13. **Own turn only.** Building a house, selling a house, mortgaging and
    redeeming are allowed only on the player's own turn.
    - Building stays at one house per turn (the existing quota).
    - Selling houses, mortgaging and redeeming have no per-turn limit.
    - The Team Lead verifies the current guards (`houses.ts`,
      `mortgage.ts`) and adds any that are missing.
    - Existing tests that perform an off-turn sale or mortgage are updated
      to this rule; their scenarios otherwise stay unchanged.
14. **Redeem lock.** An asset mortgaged in a turn cannot be redeemed in that
    same turn. Redeeming is allowed from the owner's next turn.
    - A bonus turn after a double counts as the next turn, so redeeming is
      allowed in it.
    - The lock applies to manual mortgages and to those created by automatic
      liquidation.
    - The client shows the reason when redeeming is unavailable.
15. **Unchanged.** Automatic liquidation and manual mortgage or sale during an
    open settlement are unchanged. A mandatory payment always arises on the
    payer's turn.

### Visibility, interface, recovery, tests

16. **Projection.** Every viewer sees:
    - casino bets and results;
    - drawn chance cards;
    - jail state with attempts used, and the exit fee;
    - the redeem lock on a mortgaged asset.
17. **Client, in the accepted design system:**
    - a casino bet dialog (amount within the limits, with the reason when a
      bet is not allowed) and a result animation;
    - a chance card animation shown to every player;
    - the jail state on the token and in the players panel, and the attempt
      number in the turn header (as today);
    - the prisoner's choice "Бросить на дубль" or "Заплатить X и выйти";
    - the redeem-locked reason.

    Use `docs/design/ui-mvp-v1.html` and the design tokens. Where the mockup
    has no frame for a surface, follow the existing dialog patterns and list
    it as a deviation. Desktop at 1440x900 has no page scroll, and the
    mobile layout at 390x844 works.
18. **Recovery.** A server restart and a tab reload preserve the jail state
    and attempts, a pending casino decision, an open chance or fee payment,
    and the redeem locks.
19. **Tests.** Deterministic core tests cover every new rule:
    - the casino limits and both outcomes;
    - all four chance cards;
    - each jail exit path, including a fee shortfall to bankruptcy;
    - "В тюрьму" with a double;
    - the redeem lock across normal and bonus turns.

    A replay test covers the new events. The JS bundle budget stays within
    the cap recorded in the visual-design effort, or the PR states the new
    total by the same method (per-file gzip -9 over
    `apps/client/dist/assets/*.js`, Node 22).

## Scope and non-goals

In scope:
- `packages/game-core`: casino, chance, final jail, own-turn guards, redeem
  lock, removing the prior jail rule;
- `packages/protocol`;
- `apps/server`: persistence, recovery and the stored-game handling;
- `apps/client`: dialogs, animations and states;
- e2e browser scenarios.

Not in scope:
- the extended chance catalogue and multi-creditor cards (post-MVP);
- credit;
- trades (stage 7, which may run in parallel later);
- bots;
- the stage 8 polish items;
- the visual-design follow-ups recorded on 2026-11-20 (a CI bundle check,
  dimming the journal under dialogs, the "В лобби" exit for an eliminated
  player, mobile TBT, logo sizes). These need a separate brief.

## Canonical sources

- `ROADMAP.md`: stage 6 with the owner decisions of 2026-11-16 and 2026-11-19,
  and stage 1 (third double, forced roll).
- `GAME-BREAKDOWN.md` § "Особые клетки и события", § "Порядок ходов, ход и
  кости", § "Ипотека и расчёт долгов", § "Банкротство".
- `docs/efforts/stage-5-mortgage-debts-bankruptcy.md` revision 2 and its
  design.
- `docs/efforts/visual-design.md` revision 3 and its accepted evidence.
- `docs/design/ui-brief.md` § 6.6, `docs/design/ui-mvp-v1.html`.
- `openspec/specs/` as accepted after the visual-design effort.

## Architecture constraints

These are accepted and mandatory, unchanged from earlier stages:
- Headless deterministic core. Time and entropy come only from
  TransitionContext, which covers both the casino and chance draws.
- The server is authoritative: clients send intents only and each viewer gets
  its own projection.
- One room per process, with commands executed sequentially.
- Persist before broadcast. Recovery is from a snapshot plus the log tail.
- Stack as in ROADMAP.md; client per Feature-Sliced Design with Tailwind tokens
  and Reka UI.

`main` deploys to staging automatically and must stay deployable.

## Delegated and reserved decisions

The Team Lead decides:
- state, event, command and protocol shapes, including whether the chance
  payment reuses the rent settlement types or generalises them;
- the casino decision window: before `EndTurn` or until the deadline;
- the representation of the redeem lock;
- the stored-game handling;
- task order and test strategy.

Escalate to the CTO:
- any case these rules do not determine, for example a chance card or casino
  landing during a forced-roll continuation, or a jail fee while an auction is
  pending;
- any conflict with the stage 5 liquidation or the stage 4 rent paths.

The owner decides any change to a **[CTO]** item, through the CTO.

## Dependencies, risks, and limits

- VM agents work only on branches with PRs and never push to `main`. They
  rebase on current `main` before opening a PR. Routine PRs merge through
  `pr-merge-gate` after an independent review and green CI on the exact head.
- Codex is the default Engineer engine. Keep parallelism within usage limits.
- Agents never dispatch, approve or cancel a production deployment.
- Risk: generalising rent settlement to a bank creditor touches stage 5 paths.
  The existing stage 4-5 browser suites must stay green.

## Required Team Lead output

- A technical design covering:
  - the casino and chance draws;
  - the bank-creditor payment;
  - the jail state machine and exit paths;
  - the own-turn guards and the redeem lock;
  - projection and protocol;
  - the stored-game handling.
- A task decomposition with ordering.
- An integration plan, an evidence plan and focused escalations.

## Completion evidence

- CI is green on the final `main`, `openspec validate --all --strict` passes,
  and staging runs the final `main`.
- Every PR has an independent review.
- Browser scenarios with 3 clients and seeded dice:
  1. A casino win and a casino loss, both visible to all players.
  2. A positive and a negative chance card. The negative card is paid with a
     liquidation step.
  3. Landing on "В тюрьму" sends the player to jail, then they are released
     by a double.
  4. A voluntary exit by paying the fee.
  5. A third failed attempt: the player pays and moves.
  6. A mortgage, then redeem is refused in the same turn and allowed in the
     next turn (including a bonus turn).
  7. A server restart with a prisoner and a mortgage lock in place.
- App/design pairs at 1440x900 and 390x844 for the casino dialog, the chance
  card, the jail choice and the jail status. Frames must pass the blank-image
  guard.
- A replay test and core tests per criterion 19.
- ROADMAP.md "Сделано" is updated.

## Revision history

- 1: initial handoff. Amended before merge (TL pre-read 20261120T065958Z): jail fee timing J1 = option A in criterion 9; TL assumptions on stored prior jail logs, own-turn test updates and integer percentages accepted.

## Acceptance

The Team Lead records acceptance of this exact revision or returns exact gaps.
A material change creates a new revision.
