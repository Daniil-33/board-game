# CTO -> Team Lead Effort Handoff

```yaml
id: EFF-debug-mode
revision: 1
project: economic-board-game
repo: github.com/Daniil-33/board-game
created_at: 2026-11-20T18:10:00Z
source_commit: 12cbc19 # plus the docs PR that adds this file
owner: cto
status: proposed
starts_after: EFF-stage-6-special-cells accepted by the CTO
```

## Outcome

ROADMAP.md section "Отладочный режим" (owner decision 2026-11-20). The owner
and agents can create a debug room on staging or locally and reproduce any
game situation quickly. In a debug room they can set:
- the starting capital and the turn duration;
- the dice, the casino result and the chance card;
- token positions, money, asset ownership and houses.

Ordinary rooms and the production deployment are unchanged. This effort starts
after stage 6 is accepted and runs before stage 7 (trades).

## Expected behavior and acceptance criteria

Owner sources:
- the ROADMAP section above;
- the owner's answers in Telegram topic 3 on 2026-11-20: staging and local
  only, all players, all proposed options except the mortgage fast-forward,
  next stage.

Items marked **[CTO]** are CTO interpretations within those answers.

### Availability

1. **Server switch.** Debug rooms exist only when the server runs with an
   explicit switch, for example `DEBUG_ROOMS=1`. Set it for staging and for
   the local dev and compose stacks.
   - The production deploy configuration never sets it, and a deploy test
     fails if it does.
   - With the switch off, the server rejects a debug room request and every
     debug command. The client shows no debug controls.
2. **Ordinary rooms are unchanged.** Ordinary rooms behave exactly as before,
   on every server. Debug commands are rejected in an ordinary room.

### Creating a debug room

3. **Room creation.** Room creation has an "Отладка" toggle. When it is on,
   the creator sets:
   - **Starting capital:** a multiple of 10 from 1,000 to 1,000,000; the
     default is the normal formula.
     **[CTO]** Every value derived from the starting capital follows the
     chosen value through the existing formulas: lap reward, jail fee, casino
     cap and chance amounts.
   - **Turn duration:** 45 s (the default), 2 min, 5 min or 10 min. The
     forced-roll continuation, the purchase decision and the auction response
     keep their normal durations.
4. **Marking.** A debug room is marked "Отладка" in the lobby, the waiting
   room and the game header. The debug settings are fixed when the game
   starts.

### Debug actions during a game

Every member of a debug room may use them (owner answer 2). The actions:

5. **Dice.** Set the values of both dice (1-6 each) for the next movement
   roll in the room, whoever makes it. This covers:
   - a jail attempt;
   - a roll forced at the deadline;
   - a bonus-turn roll.

   The override is used once, and setting it again replaces it. Without an
   override, the dice are random as usual. Turn-order rolls in setup stay
   random.
6. **Casino and chance.** Set the result of the next casino bet (win or loss)
   and the next chance card (one of the four), each used once.
7. **Timer pause.** Pause and resume the turn timer of the current turn.
   **[CTO]** Auction and purchase timers are not paused.
8. **Move a token. [CTO]** Allowed only for the active player of the current
   turn, before they roll, and it replaces the roll.
   - The token moves to the chosen cell with no lap reward.
   - The landing effects apply as for a normal move: purchase, rent, casino,
     chance and "В тюрьму".
   - The turn counts as rolled, and it is not a double.
9. **Money.** Give money to any active player from the bank, or take money
   from them to the bank. The amount is a multiple of 10, and taking cannot
   bring a balance below zero. No debt arises.
10. **Assets and houses.** Give any free or owned asset to any active player.
    Set 0-4 houses on an asset whose group its owner fully owns. Neither
    action costs anything, uses a quota or creates a debt.
11. **Invariants.** A debug action that would break a core invariant is
    rejected with a reason, for example uneven houses, houses on a mortgaged
    asset, or an action during an auction or open payment where the Team
    Lead's design says so. Debug actions never bypass the invariants;
    they only skip costs, quotas and turn ownership.

### Visibility, recording, recovery

12. **Journal.** Every debug action is a core event visible to all players.
    It appears in the journal marked "отладка" with who did it. Dice, casino
    and chance overrides are shown when they are used, not when they are set.
    **[CTO]** The override is visible to everyone; nothing is hidden.
13. **Determinism.** Debug actions and overrides are logged commands that go
    through the core, so replay and recovery stay deterministic. A server
    restart preserves:
    - a debug game;
    - its settings;
    - pending overrides;
    - a paused timer.
14. **Statistics.** A finished debug game is not counted in game results
    statistics. Whether it is stored with a debug flag or not stored at all
    is the Team Lead's choice.

### Interface

15. **Client.** A compact "Отладка" panel, built with the accepted design
    system, available in debug rooms only:
    - on desktop at 1440x900 it causes no page scroll;
    - on mobile at 390x844 it sits behind a control.

    It contains:
    - dice inputs;
    - the casino and chance selectors;
    - pause;
    - a cell picker;
    - money give and take;
    - asset and houses controls.

    Unavailable actions show a reason.

## Scope and non-goals

In scope:
- `packages/game-core`: debug settings, commands, events and invariant
  checks;
- `packages/protocol`;
- `apps/server`: the server switch, room flag, persistence and statistics
  exclusion;
- `apps/client`: room creation options and the panel;
- `deploy`: the staging switch and the production guard test;
- tests and browser scenarios.

Not in scope:
- the mortgage fast-forward (owner: later);
- debug in production;
- bots;
- a scenario save and load feature;
- trades (stage 7);
- changes to any ordinary game rule.

## Canonical sources

- `ROADMAP.md`: section "Отладочный режим" and the stage 1-6 rules it must
  not change.
- `GAME-BREAKDOWN.md` for the ordinary rules.
- `docs/efforts/stage-6-special-cells.md` and its design (casino, chance and
  jail state that the overrides drive).
- `docs/efforts/deploy-staging-production.md` for the staging and production
  configuration.
- `openspec/specs/` as accepted after stage 6.

## Architecture constraints

These are accepted and mandatory:
- Headless deterministic core. Overrides are state set by logged commands,
  and the core consumes them in place of TransitionContext entropy. The core
  never reads environment variables.
- The server is authoritative, and each viewer gets its own projection.
- One room per process, with commands executed sequentially.
- Persist before broadcast. Recovery is from a snapshot plus the log tail.
- The existing `E2E_FIXTURES` and test-seed paths stay test-only. Debug rooms
  do not replace them and must not weaken their `NODE_ENV=test` guard.
- `main` deploys to staging automatically and must stay deployable.

## Delegated and reserved decisions

The Team Lead decides:
- command, event and protocol shapes;
- the switch name;
- where the override state lives;
- which debug actions are blocked during an auction, purchase decision or
  open payment, within criterion 11;
- panel layout within the design system;
- the statistics handling;
- task order and test strategy.

Escalate to the CTO:
- any debug action that cannot be made deterministic;
- any action that would need an ordinary rule to change.

## Dependencies, risks, and limits

- It starts after EFF-stage-6-special-cells is accepted.
- VM agents work on branches with PRs and never push to `main`. Routine PRs
  merge through `pr-merge-gate` after an independent review and green CI on
  the exact head.
- Agents never dispatch, approve or cancel a production deployment.
- Records follow the revision rule: handoffs, archived OpenSpec changes and
  earlier briefs change only through a new revision.
- Risk: the debug paths leak into ordinary rooms. Criterion 2 needs tests on
  both the server and the core.

## Required Team Lead output

- A technical design covering:
  - the switch and the production guard;
  - room settings;
  - the override and debug command model in the core;
  - projection and protocol;
  - recovery;
  - statistics;
  - the panel.
- A task decomposition with ordering, an integration plan and an evidence
  plan.

## Completion evidence

- CI is green on the final `main`, `openspec validate --all --strict` passes,
  and staging runs the final `main` with debug rooms enabled.
- The production deploy guard test passes, and the production configuration
  has no switch.
- Every PR has an independent review.
- Browser scenarios with 2-3 clients in a debug room:
  1. A custom starting capital and turn duration, with the derived lap
     reward.
  2. A set double, a set casino win and a set negative chance card, each
     shown in the journal.
  3. A token moved to a cell, with the landing effect.
  4. A full group with houses given to a player, then rent at the expected
     amount.
  5. Money given and taken, and a pause and resume.
  6. A server restart with pending overrides and a paused timer.
  7. An ordinary room rejects every debug command and shows no panel.
- App/design pairs at 1440x900 and 390x844 for room creation with debug
  options and for the debug panel.
- ROADMAP.md "Сделано" is updated.

## Revision history

- 1: initial handoff.

## Acceptance

The Team Lead records acceptance of this exact revision or returns exact gaps.
A material change creates a new revision.
