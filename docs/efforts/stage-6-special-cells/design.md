# Stage 6 special cells: Team Lead technical design

Effort: `EFF-stage-6-special-cells`.
- Handoff: `docs/efforts/stage-6-special-cells.md` revision 1, merged in PR #113 as `e61beb9`.
- Accepted by the Team Lead on 2026-11-20.
- Criterion numbers (C1..C19) refer to the handoff.

This document holds only the decisions delegated to the Team Lead and the interpretations it states. Product rules come from the handoff, `ROADMAP.md` stage 6 and `GAME-BREAKDOWN.md`.

## Facts checked against `main` (`e61beb9`)

- **Own-turn guards (C13) already exist.** `buildLegality`, `saleLegality`, `mortgageLegality` and `redeemLegality` all return `NOT_ACTIVE_PLAYER` for anyone but the turn owner (`houses.ts`, `mortgage.ts` `common()`). The command handlers check the actor first. Build and redeem are blocked by an open rent; mortgage and sale are allowed during it (C15). Stage 6 adds only the redeem lock and extends the "open payment" checks to the new bank charge. Because the core already rejects off-turn actions, no existing test can perform one; C13's test-update clause has nothing to change.
- **Values.** `startingCapital` and `lapReward` (`money.ts`) give:

  | Players | Jail fee `Q(reward/4)` | Casino cap `Q(capital×10/100)` | 5% card | 10% card |
  | --- | --- | --- | --- | --- |
  | 2 | 990 | 2990 | 1490 | 2990 |
  | 3 | 660 | 1990 | 990 | 1990 |
  | 4 | 490 | 1490 | 740 | 1490 |
  | 5 | 390 | 1190 | 590 | 1190 |
  | 6 | 330 | 990 | 490 | 990 |

  All percentages use integer arithmetic.
- **Deadlines.** A `Timeout` before the roll rolls for the owner and continues the turn for `CONTINUATION_MS` (20 s). A `Timeout` after the roll closes the turn, or opens the auction for a pending purchase.
- **Mandatory settlement.** Every turn closure runs `settleMandatory` → `settleRent` → `settleDebt`, before any bonus turn starts. So an open payment never carries into the next turn, a bonus turn included.
- **Recovery.** The server rebuilds a room from its latest snapshot plus the log tail, by re-executing the logged commands and comparing the events (`ReplayDivergenceError`). SIGTERM drains every room and writes a snapshot at its head (`main.ts`), so after a normal deploy every live room has an empty tail.

## Versions and stored games (C12, C18)

| Item | Choice |
| --- | --- |
| Rules version | `core-8` (TASK-s6-core-payments), then `core-9` (TASK-s6-core-cells). Each core PR bumps it once, so every merged `main` stays deployable. |
| Protocol | Bump `PROTOCOL_VERSION` once in each PR that changes `StateView` or event payloads. Client and server ship together. |
| Stored games | **Snapshot upgrade, not room closure.** This differs from stages 2-5. |

How the snapshot upgrade works:
- `game-core` exports `upgradeState(state): GameState`. It is pure and chains one step per version (`core-7 → core-8 → core-9`). Each step fills the new fields with their neutral values and sets `rulesVersion`.
- On every load, the server applies it to a latest snapshot with an older `rulesVersion`, then replays the log tail under the current rules as today. That is the "one-time snapshot migration" of C12.
  - The upgrade runs in memory; it is pure and deterministic.
  - It is not written back at the same revision, because `writeSnapshot` keeps an existing snapshot for a revision. The next regular snapshot, at the latest at shutdown, is stored in the new version.
  - A tail written **after** the upgrade, under the current rules, replays exactly.
  - A tail written under the **old** rules can diverge. That only happens after a crash, because a normal deploy snapshots at SIGTERM. The existing recovery handling then logs the `ReplayDivergenceError` and marks the room failed (`GameRoom.failed`, logs kept). No new close path is added.
- **Jail (`core-8 → core-9`).** An interim prisoner keeps `attemptsUsed`. The final rules apply from their next roll or action, as in the handoff's example.
- **Mortgages (`core-7 → core-8`).** Every stored mortgage gets `lockedTurnId: null`, meaning not locked.
- Finished games stay as stored history. No code re-executes old logs outside recovery, so removing the the earlier jail events breaks no reader. The replay test (C19) covers the new events.

## Core (`packages/game-core`)

### Bank creditor and the chance charge (C6, C9)

TL choice: **generalise the debt, keep the rent slot.**
- `settleDebt(state, debt, now)` takes `creditor: { kind: 'player', id } | { kind: 'bank' }`.
  - For the bank, the paid amount is debited and not credited to anyone.
  - `LiquidationApplied.creditorId` and `PlayerBankrupt.creditorId` become `PlayerId | null`, where null is the bank. `Elimination.creditorId` is already nullable.
  - Bankruptcy to the bank follows stage 5 I3: the bank receives `min(debt, cash + house refunds)`, and assets return to the bank free.
- `state.rent` keeps its stage 4-5 shape and meaning, so the rent paths and their tests don't move.
- New slot `state.charge: BankCharge | null`, where `BankCharge = { payerId, amount, cause: 'chance' }`. It is a mandatory payment to the bank:
  - opened by a negative chance card (event `ChargeDue`);
  - paid by the owner with `PayCharge` (payload `null`, the same guards as `PayRent`);
  - otherwise settled by `settleMandatory` at every turn closure (event `ChargePaid { payerId, amount, auto }`);
  - a shortfall runs the stage 5 liquidation, and bankruptcy goes to the bank.
- **Invariant:** at most one of `rent` and `charge` is non-null. Both can only open on a landing, and every closure settles both.
- `settleMandatory` settles `rent`, then `charge`. Only one can be open at a time, so the order never matters in practice.
- The "open payment" checks treat `charge` like `rent`. While a charge is open:
  - **blocked:** build (`PAYMENT_PENDING`), redeem (`PAYMENT_PENDING`), casino bet;
  - **allowed:** mortgage and house sale (C6, C15).
  - The existing `RENT_PENDING` code stays for rent.
- `BalanceChanged.reason` gains `'casino' | 'chance' | 'jail-fee'`. A bank-creditor debt uses the reason of its cause.

### Redeem lock (C14)

- `Mortgage` gains `lockedTurnId: string | null`.
- `applyMortgage` (manual and automatic) sets it to the current `turn.turnId`.
- `redeemLegality` returns `REDEEM_LOCKED` when `lockedTurnId === state.turn.turnId`.
- **Bonus turns:** they get a new `turnId` (`startTurn`), so redeeming is allowed in a bonus turn, as C14 requires.
- **Automatic liquidation at turn closure:** it runs before the next turn starts, so those mortgages are already redeemable on the owner's next turn. Liquidation inside `PayRent` or `PayCharge` locks the asset for the rest of that turn.
- **Projection:** `StateView.mortgages[id]` exposes `lockedTurnId`, and the client compares it with `turn.turnId` (C16). It is not cleared at turn closure; comparing ids is enough, and it keeps the state minimal.

### Landing effects

`applyRoll` already calls `offerPurchase` then `offerRent` after a move. Stage 6 adds one dispatcher, `landOn(state, playerId, diceSum)`, used after **every** move: a normal roll, a jail release and the forced-fee move.

| Cell kind | Effect |
| --- | --- |
| asset | purchase offer or rent (unchanged) |
| `casino` | open a casino decision |
| `chance` | draw a card |
| `go-to-jail` | send to jail |
| `start`, `jail` | none (cell 10 by a move is a visit, C8) |

**Casino (C1-C3).** TL choice for the decision window: the decision is open from the landing until the player bets, declines, ends the turn, or the turn deadline passes (the continuation window included).
- On landing, set `state.casino = { playerId, turnId, cap }`, where `cap = Q(startingCapital × 10 / 100)`. Event `CasinoOffered { playerId, cap }`.
- `PlaceCasinoBet { amount }`:
  - checks, in order: auction, actor, deadline, `casino` open for this turn, no open `rent`/`charge` (`PAYMENT_PENDING`), and `amount` an integer multiple of 10 with `10 ≤ amount ≤ min(cap, cash)` (`INVALID_BET`);
  - draws `nextIntInclusive(rng, 0, 1)`; 1 is a win;
  - emits `BalanceChanged` (reason `casino`) and `CasinoResolved { playerId, amount, won, balance }`, then clears `casino`.
- `DeclineCasino` (payload `null`) clears it with `CasinoDeclined`. The mockup has "Не играть"; the explicit command closes the dialog for every viewer.
- `EndTurn` and `Timeout` clear an open casino with `CasinoDeclined { auto: true }`.
- When `min(cap, cash) < 10`, `CasinoOffered` still fires and the client shows the reason ("Недостаточно денег для ставки"). Only `DeclineCasino`, `EndTurn` or the deadline closes it.

**Chance (C4-C6).**
- Draw `nextIntInclusive(rng, 0, 3)` and map it to `['gain-5', 'loss-5', 'gain-10', 'loss-10']`.
- The amount is `Q(startingCapital × p / 100)`.
- Event `ChanceDrawn { playerId, card, amount }`. A gain is credited at once (reason `chance`). A loss opens `charge`.

**Go to jail (C7).** Landing on cell 30:
- emits `SentToJail { playerId, from: 30, to: 10 }` with no lap reward;
- sets `jail[playerId] = { attemptsUsed: 0 }`, `doublesStreak: 0`, `pendingBonus: false`;
- closes the turn with reason `sent-to-jail`.

The third double already uses this path. Settlement at closure still applies, but a landing on cell 30 opens no payment.

### Jail (C9-C12)

State: `jail[playerId] = { attemptsUsed }`, unchanged. The fee is `Q(lapReward / 4)`. All decisions are made before the roll (`turn.rolled === false`).

- **`RollDice` while in jail = roll for a double:**
  - **double:** `JailReleased { reason: 'double' }`, then move by the sum and land. No bonus turn and no streak count, as in the interim rule.
  - **fail with `attemptsUsed + 1 < 3`:** `JailAttemptFailed { attemptsUsed }`. The player stays, `rolled = true`, and the turn continues without movement. Own-turn actions are allowed.
  - **fail on the third attempt: the forced fee (C9 option A).**
    - If cash ≥ fee, debit at once (reason `jail-fee`).
    - Otherwise run `settleDebt` with the bank creditor and `amount = fee` at once (stage 5 liquidation in the owner's order; no manual window).
    - If bankrupt: no move, and the turn closes with reason `bankrupt` (the stage 5 `scheduleAfterSettlement` path).
    - Otherwise `JailReleased { reason: 'fee-forced', fee }`, then move by that roll's sum and land. No bonus turn.
- **`PayJailFee`** (payload `null`; before the roll):
  - guards: auction, actor, deadline, `NOT_IN_JAIL`, `ALREADY_ROLLED`, and cash < fee → `INSUFFICIENT_FUNDS`;
  - debits the fee (reason `jail-fee`) and emits `JailReleased { reason: 'fee', fee }`;
  - the turn continues unrolled, and the player rolls with a normal `RollDice` (normal doubles rules, so a double grants the usual bonus turn);
  - if the deadline passes after paying and before rolling, the forced roll is a normal roll.
- **Deadline (C10).** A `Timeout` before the roll goes through `applyRoll`, which takes the jail branch. That is the roll-for-a-double choice, including the forced fee on the third failure. The turn then continues for `CONTINUATION_MS`. A voluntary exit is never automatic.
- **Removed:** `jail-attempt module`, the three-attempt jail rule, the the earlier jail events and their "temporary" texts in core, protocol (`frames.ts`) and client.

### Projection (C16)

Everything is public, as today:
- `casino`, `charge` and `jail` in `StateView`;
- `mortgages[id].lockedTurnId`;
- `economy` (already public), so the client derives the fee and cap with exported pure helpers `jailFee(economy)` and `casinoCap(economy)`;
- the events `CasinoOffered`, `CasinoResolved`, `CasinoDeclined`, `ChanceDrawn`, `ChargeDue`, `ChargePaid`, `JailAttemptFailed` and `JailReleased`, classified public in `EVENT_VISIBILITY`.

## Server (`apps/server`)

- The `upgradeState` load path described in "Versions and stored games", with integration tests:
  - a `core-7` snapshot with a prisoner and a mortgage loads as current;
  - after new commands and a restart (no shutdown snapshot), the `core-7` snapshot plus the new tail replays exactly;
  - a `core-7` snapshot with a tail written under `core-7` that diverges ends as a failed room, with the error logged.
- The restart integration test (C18) restores, from a snapshot plus tail:
  - a prisoner with attempts used;
  - an open casino decision;
  - an open charge;
  - a redeem lock.
- No new timers. The casino and jail decisions use the turn deadline.

## Client (`apps/client`), C17

Built in the accepted design system. Frame `desktop-08-тюрьма-казино-шанс` covers the jail choice, the casino bet and the chance card. There are no mobile frames for these, so mobile uses the existing bottom-sheet pattern (`game-dialogs`) and is listed as a deviation.

| Surface | Shown when | Notes |
| --- | --- | --- |
| Jail choice "Вы в тюрьме · Попытка N из 3" | own turn, in jail, before the roll | buttons "Бросить на дубль" (`RollDice`) and "Заплатить X и выйти" (`PayJailFee`, disabled with a reason when cash < fee); the attempt bar as in the frame |
| Jail status | always | on the token, in the players panel, and "В тюрьме · попытка N из 3" in the turn header (existing) |
| Casino bet | own turn, `casino` open | stepper in steps of 10, cap shown as "до X", win/loss preview, "Сделать ставку" and "Не играть"; disabled with a reason when no bet is possible; the others see a non-modal status |
| Casino result | `CasinoResolved` | a result animation for every viewer |
| Chance card | `ChanceDrawn` | the frame's card flip for every viewer; a loss shows "К оплате X" and uses the existing rent-card payment pattern for `charge` (pay, or manage assets) |
| Redeem locked | own mortgaged asset, `lockedTurnId === turn.turnId` | "Выкупить" disabled with "Выкуп доступен со следующего хода" |

Additional constraints:
- Desktop at 1440x900 has no page scroll, and the 390x844 layout works.
- Animations respect `prefers-reduced-motion`, as existing ones do.
- Sounds use the existing engine, if it already has a fitting cue; adding new sound assets is out of scope.
- **Bundle:** the current total is 340,994 B under the TL method (14 files, per-file gzip -9, `pnpm --filter @game/client run build:bundle` on node:22), and the effort cap is 343,863 B. Report the new total by the same method in the client PR. If it is above the cap, say so explicitly and escalate before merge.

## Escalations already resolved by this design

- **Casino or chance landing in a forced-roll continuation.**
  - Casino: the decision is open until the continuation deadline.
  - Chance: a gain is credited at once; a loss is a charge settled at closure.

  Both follow C1 and C6 with no new rule.
- **Jail fee while an auction is pending.** It cannot happen. The fee is due before the move, and an auction opens only after a landing or at closure, in the same turn.

## Task decomposition and order

| # | Task | Depends on | Scope |
| --- | --- | --- | --- |
| 1 | `TASK-s6-core-payments` | `main` | bank creditor in `settleDebt`, `charge` slot and `PayCharge` (no producer yet beyond tests), redeem lock, `core-8`, `upgradeState`, and the server upgrade load path |
| 2 | `TASK-s6-core-cells` | 1 | `landOn` dispatcher, casino, chance, final jail, interim removal, `core-9`, projection, protocol, and the server restart integration test |
| 3 | `TASK-s6-client` | 2 (may Explore once 2's view shape is in review) | all C17 surfaces, event descriptions, locale |
| 4 | `TASK-s6-e2e` | 3 | the seven browser scenarios, design pairs, the ROADMAP "Сделано" update |

Tasks run sequentially because tasks 1 and 2 both edit `turns.ts`, `debt.ts` and `state.ts`. Each PR keeps `main` deployable and the stage 4-5 suites green.

## Evidence plan

- Core: deterministic tests per C19, and a replay test over a log that contains every new event.
- Server: upgrade and restart integration tests.
- Browser (task 4): the seven scenarios use 3 clients on the deterministic stack (`E2E_TEST_SEED`) or on named fixtures in `test-fixtures.ts`. Casino and chance outcomes come from the seeded RNG; scenario seeds and fixtures are chosen and documented in task 4.
- Design pairs at 1440x900 and 390x844 for the casino dialog, the chance card, the jail choice and the jail status. They are collected by the existing visual-evidence tooling at the final head and pass the blank-image guard.
