# Team Lead -> Engineer Task Handoff

```yaml
id: TASK-s6-core-cells
revision: 1
effort: EFF-stage-6-special-cells
project: economic-board-game
source_commit: d8673e9 # main after TASK-s6-core-payments (PR #115); rebase on current main before the PR
owner: team-lead
status: proposed
```

## Outcome

Every special cell on `CLASSIC_40` has its final MVP effect in `packages/game-core`, with protocol and server support:
- **casino:** an optional bet with a 50/50 outcome;
- **chance:** four cards; a loss opens the bank charge built in TASK-s6-core-payments;
- **"В тюрьму":** sends the player to jail;
- **final jail:** roll for a double, a voluntary fee exit, or a forced fee on the third failure, settled **before** the move.

The interim jail rule is removed and the rules version becomes `core-9`. Stored `core-8` games keep running through the `upgradeState` chain. The client UI is TASK-s6-client; this task only keeps the client compiling and describing the new events in text.

## Acceptance criteria

Product (handoff C1-C12, C16, C18, C19; design § "Landing effects", "Jail", "Projection"):

1. **Landing dispatcher.** One `landOn(state, playerId, diceSum)` runs after **every** move: a normal roll, a jail release, and the move after a voluntary or forced fee.
   - Asset cells: purchase or rent, unchanged.
   - `casino` opens a decision. `chance` draws a card. `go-to-jail` sends to jail.
   - `start` and `jail` do nothing; cell 10 reached by a move is a visit (C8).
2. **Casino (C1-C3).**
   - On landing: `state.casino = {playerId, turnId, cap}` with `cap = Q(startingCapital × 10 / 100)`, and event `CasinoOffered {playerId, cap}`.
   - **`PlaceCasinoBet {amount}`:**
     - guard order: payload, auction, actor, deadline, casino open for this turn (`NO_CASINO`), no open rent or charge (`PAYMENT_PENDING`), then `amount` an integer multiple of 10 with `10 ≤ amount ≤ min(cap, cash)` (`INVALID_BET`);
     - outcome `nextIntInclusive(rng, 0, 1)`, where 1 is a win;
     - emits `BalanceChanged` (reason `casino`), then `CasinoResolved {playerId, amount, won, balance}`, and clears the decision.
   - **`DeclineCasino`** (payload `null`) emits `CasinoDeclined {playerId, auto: false}`.
   - **`EndTurn` and `Timeout`** close an open decision with `CasinoDeclined {auto: true}`, before settlement.
   - When `min(cap, cash) < 10`, the decision still opens; only a decline, `EndTurn` or the deadline closes it.
   - One bet per landing. A new landing on a bonus turn opens a new decision.
3. **Chance (C4-C6).**
   - Draw `nextIntInclusive(rng, 0, 3)` → `['gain-5', 'loss-5', 'gain-10', 'loss-10']`.
   - The amount is `Q(startingCapital × p / 100)` in integer arithmetic. For 2-6 players that gives 1490/990/740/590/490 for 5% and 2990/1990/1490/1190/990 for 10%.
   - Event `ChanceDrawn {playerId, card, amount}`.
   - A gain is credited at once (reason `chance`). A loss opens `charge` through the existing `openCharge`.
4. **Go to jail (C7).** Landing on cell 30:
   - emits `SentToJail {playerId, from: 30, to: 10}` with no lap reward;
   - sets the jail entry with `attemptsUsed: 0`, `doublesStreak: 0` and `pendingBonus: false`, even when the move came from a double;
   - closes the turn with reason `sent-to-jail`.

   The third double is unchanged and uses the same path.
5. **Jail exit (C9-C10, option A).** The fee is `Q(lapReward / 4)`: 990/660/490/390/330 for 2-6 players.
   - **`RollDice` while in jail = roll for a double:**
     - **double:** `JailReleased {playerId, reason: 'double'}`, move by the sum, then land. No bonus turn and no streak count.
     - **fail with attempts left:** `JailAttemptFailed {playerId, attemptsUsed}`. The player stays, `rolled = true`, and the own-turn actions remain.
     - **third fail:** if cash ≥ fee, debit at once (reason `jail-fee`). Otherwise run `settleDebt` with `creditor {kind: 'bank'}` and `amount = fee` at once, with no manual window.
       - If bankrupt: no move, and the turn closes with reason `bankrupt`.
       - Otherwise `JailReleased {reason: 'fee-forced', fee}`, then move by that roll's sum and land. No bonus turn.
   - **`PayJailFee`** (payload `null`):
     - guards: payload, auction, actor, deadline, `NOT_IN_JAIL`, `ALREADY_ROLLED`, and cash < fee → `INSUFFICIENT_FUNDS`;
     - debits the fee and emits `JailReleased {reason: 'fee', fee}`;
     - the turn stays unrolled, and the next `RollDice` is a normal roll with normal doubles rules;
     - a deadline after paying gives a normal forced roll.
   - **Timeout before the roll** = roll for a double, via the same branch, including the third-fail fee. The turn then continues for `CONTINUATION_MS`. A voluntary exit is never automatic.
6. **Interim removal (C12).**
   - Delete `interim-jail.ts`, `INTERIM_JAIL_RULE`, the `Interim*` events and types, and every "temporary" or interim text in core, protocol (`frames.ts`) and client.
   - `JailEntry` keeps `{attemptsUsed}`.
7. **Projection and protocol (C16).**
   - `casino` is public in `StateView`.
   - The new events (`CasinoOffered`, `CasinoResolved`, `CasinoDeclined`, `ChanceDrawn`, `JailAttemptFailed`, `JailReleased`) are classified public.
   - The commands `PlaceCasinoBet`, `DeclineCasino` and `PayJailFee` go into the protocol schemas.
   - Pure exports `jailFee(economy)` and `casinoCap(economy)` are for the client.
   - `PROTOCOL_VERSION` bumps once.
8. **Versions.**
   - `CURRENT_RULES_VERSION = 'core-9'`.
   - The `upgradeState` chain goes `core-7 → core-8 → core-9`. The `core-8 → core-9` step adds `casino: null` and keeps jail entries, so an interim prisoner keeps `attemptsUsed` and the final rules apply from their next action.
   - The server load path needs no version literal; it already upgrades every snapshot.
9. **Carried from PR #115 review (must fix in this task):**
   - **RVW-007:** `upgradeState` returns a **genesis** state (`rulesVersion: null`) unchanged. Add an integration case: a genesis room, then shutdown, then restore equal to genesis.
   - **RVW-008:** the divergence test in `stage6-recovery.int.test.ts` also asserts `tailIndex: 1` and `errorCode: 'REDEEM_LOCKED'`.
10. **Seeded jail browser scenario** (`e2e/compose.spec.ts`, seed 6689, "interim jail attempt"):
    - Update it to the final rules: the same seed, with the first attempt asserted as `JailAttemptFailed`.
    - **Investigate the known flake.** `assertJournalEntryBelowHeading` (`helpers.ts:30`) timed out once on PR #115 `2d82a60` (job 136294817053) and passed on rerun.
      - Repeat the seeded job locally at least 10 times.
      - If it reproduces, fix the cause (e.g. the scroll-follow settle after viewport restore). Do NOT lengthen the poll.
      - If it does not reproduce, report the runs and leave it.

Technical proof:

11. **Deterministic core tests (C19):**
    - casino cap per player count, the `INVALID_BET` bounds, both outcomes, decline, auto-decline at `EndTurn` and at the deadline, and `PAYMENT_PENDING`;
    - all four chance cards, with a loss paid by command, auto-paid, and bankrupt to the bank;
    - every jail path: double release, failed attempt with own-turn actions, voluntary fee then a normal roll (including a double giving a bonus turn), `PayJailFee` with cash < fee rejected, third fail paid from cash, third fail by liquidation, third fail bankrupt with no move, and a deadline-forced attempt;
    - "В тюрьму" reached by a double: no bonus turn and the streak reset;
    - landings after a release move (casino and chance reachable from cell 10).
12. **Replay test** over a log containing every new event.
13. **Server integration (C18):**
    - restart restores a prisoner with attempts, an open casino decision, an open charge from a chance loss, and a redeem lock;
    - the `core-8` snapshot upgrade to `core-9` is covered;
    - plus RVW-007 and RVW-008.
14. **Checks:** `pnpm build`, `pnpm test`, `pnpm test:integration`, client lint and `openspec validate --all --strict` pass. CI is 4/4 on the exact head, and the stage 3-5 browser suites are green.

## Scope and non-goals

In scope:
- `packages/game-core`: `turns.ts`, a new cell module or modules, `state.ts`, `invariants.ts`, `projection.ts`, `lifecycle.ts`, `money.ts`, the index, and removal of `interim-jail.ts`;
- `packages/protocol`;
- `apps/server`: tests and any fixture names for the new states;
- `apps/client`: only what is needed to compile, plus text descriptions of the new events in the journal (`entities/event/describe.ts`), with ru and en locale.

Not in scope:
- the dialogs, animations, jail choice UI, casino stepper and chance card (TASK-s6-client);
- new stage 6 browser scenarios (TASK-s6-e2e), beyond updating the seeded jail scenario in criterion 10.

## Canonical references

- `docs/efforts/stage-6-special-cells.md` rev 1 (C1-C12, C16, C18, C19).
- `docs/efforts/stage-6-special-cells/design.md`.
- PR #115 (`d8673e9`): `settleDebt` creditor, `charge`, `openCharge`, `PayCharge`, the redeem lock, and `upgradeState`.
- The stage 5 design (liquidation order, I3).
- `openspec/specs/` as of `d8673e9`.

## Constraints and invariants

- The core is deterministic. Every draw comes from the game RNG, mixed with `TransitionContext` entropy, so replay stays exact.
- Integer money only.
- The stage 4-5 rent, liquidation and charge semantics are unchanged.
- An open-charge resignation voids the charge (accepted R1 extension).
- Never accept a PR that weakens an existing test to pass.

## Dependencies

- Upstream: TASK-s6-core-payments, merged as `d8673e9`.
- TASK-s6-client builds on this task's view and events, so keep the shapes listed above. Report any change to them to the TL before the PR.

## Delegated decisions

The Engineer decides:
- module layout and helper names;
- exact event payload fields beyond those named above;
- error-code names beyond those named above, provided they don't collide;
- the order of events within one transition, as long as `BalanceChanged` precedes the semantic event, as elsewhere in the codebase;
- the fixture style.

Return to the TL:
- any rule these criteria leave undetermined;
- any conflict with stage 4-5 settlement;
- any change to the seeded dice stream beyond the jail scenario.

## Required workflow

1. Explore.
2. Propose the OpenSpec change `s6-core-cells`.
3. Apply in a fresh context after TL approval.
4. Verify.
5. Open the PR.
6. Independent review; the review request requires the full 40-char head SHA in the verdict block.
7. Review fixes.

Archive the OpenSpec change in the PR before the final exact-head review. **Do not merge.**

**Standing test permissions** (the same classes as TASK-s6-core-payments; no need to ask):
- current-version literals → `CURRENT_RULES_VERSION` or `PROTOCOL_VERSION`;
- additive coverage rows for new error codes in code-enumerating tests;
- `core-9` neutral fields (`casino: null`) in hand-built `GameState`/`StateView` literals in fixtures, helpers and the dev mock.

Every other change to an existing test needs TL approval first. List each adjustment in the PR body with its reason.

## Required checks

Everything in criteria 11-14. The PR body lists:
- every new command, event and error code with its guard order;
- the `upgradeState` chain;
- the replay-test events;
- the flake investigation result;
- the CI run on the exact head.

## Escalation conditions

Escalate to the TL if:
- a stage 4-5 behaviour test must change;
- the forced-fee liquidation cannot reuse `settleDebt` unchanged;
- a seeded scenario cannot reach a required state;
- the bundle or client work grows beyond compile and text descriptions.

## Deliverables

- The branch `agent/task-s6-core-cells` and its PR.
- The archived OpenSpec change.
- Test evidence in the PR body.
- The independent review report.
- Residual risks.
