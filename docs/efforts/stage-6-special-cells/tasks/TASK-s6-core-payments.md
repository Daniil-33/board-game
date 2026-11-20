# Team Lead -> Engineer Task Handoff

```yaml
id: TASK-s6-core-payments
revision: 1
effort: EFF-stage-6-special-cells
project: economic-board-game
source_commit: e61beb9 # main after the stage 6 handoff (PR #113); rebase on current main before the PR
owner: team-lead
status: proposed
```

## Outcome

`packages/game-core` can settle a mandatory payment to the **bank**. It has a bank-charge slot with its payment command, and mortgages carry a **redeem lock** for the turn they were created in.

The rules version becomes `core-8`. Stored `core-7` games keep running through a pure `upgradeState` that the server applies on load.

No cell produces a bank charge yet; TASK-s6-core-cells adds chance and the jail fee. This task gives them a tested foundation, and the stage 4-5 paths stay unchanged.

## Acceptance criteria

Product (handoff C6, C9 settlement mechanics, C13-C15, C12/C18 stored games; design § "Bank creditor and the chance charge", "Redeem lock", "Versions and stored games"):

1. **Bank creditor.** `settleDebt` accepts `creditor: {kind:'player', id} | {kind:'bank'}`.
   - For the bank, the paid amount is debited from the payer and credited to no one.
   - The three stage 5 cases are unchanged: cash, immediate bankruptcy, tiered liquidation.
   - `LiquidationApplied.creditorId` and `PlayerBankrupt.creditorId` are `PlayerId | null`; null is the bank.
   - Bankruptcy to the bank: the bank receives `min(debt, cash + house refunds)`, assets return free, mortgages clear, and the elimination is recorded with `creditorId: null`.
   - Rent keeps passing `{kind:'player'}`, and every stage 4-5 core test still passes unchanged.
2. **Bank charge.**
   - `GameState.charge: {payerId, amount, cause: 'chance'} | null`.
   - `ChargeDue` when it opens.
   - `PayCharge` (payload `null`; the same guard order and codes as `PayRent`, with `NO_CHARGE`).
   - `settleMandatory` settles `rent`, then `charge`, at every turn closure (`ChargePaid {payerId, amount, auto}`, plus the stage 5 liquidation and bankruptcy events).
   - Bankruptcy in `PayCharge` closes the turn as `PayRent` does today.
   - An exported core helper opens a charge, for tests now and chance later.
   - Invariant: `rent` and `charge` are never both non-null.
3. **Open-payment guards.** While a charge is open:
   - build and redeem fail with `PAYMENT_PENDING`;
   - mortgage and house sale are allowed.

   Rent keeps `RENT_PENDING`.
4. **Redeem lock.**
   - `Mortgage.lockedTurnId: string | null`.
   - `applyMortgage` sets it to `turn.turnId`, both manually and in liquidation.
   - `Redeem` fails with `REDEEM_LOCKED` in that same turn.
   - Redeem is allowed in the owner's next turn, **including a bonus turn** after a double (it has a new `turnId`).
   - Mortgages created by liquidation at turn closure are redeemable on the owner's next turn.
   - The view exposes `lockedTurnId`.
5. **Own-turn guards (C13).** Tests prove that a player who is not the turn owner gets `NOT_ACTIVE_PLAYER` for build, sale, mortgage and redeem, including during another player's open rent and during an auction (`AUCTION_IN_PROGRESS` precedence unchanged). No production change is expected; if a missing guard is found, add it and report it.
6. **Versions and stored games.**
   - `CURRENT_RULES_VERSION = 'core-8'`.
   - `upgradeState` (pure, exported) maps a `core-7` state to `core-8`: `charge: null`, every mortgage `lockedTurnId: null`, `rulesVersion: 'core-8'`. It is the identity on `core-8`.
   - The server applies it to a loaded snapshot with an older version, then replays the tail under the current rules (design § "Versions and stored games"). No SQL migration closes rooms.
   - `PROTOCOL_VERSION` bumps once if the view or event payloads change.
7. **`BalanceChanged.reason`** accepts `'chance' | 'jail-fee' | 'casino'`. Only the reasons this task emits need tests; the others are reserved for TASK-s6-core-cells.

Technical proof:

8. Core tests:
   - bank-creditor settlement in all three cases (cash, liquidation steps, bankruptcy with houses), with exact balances and events;
   - a charge paid by command, auto-paid at `EndTurn`, auto-paid at the deadline, and bankrupt;
   - the lock in the same turn, the next turn, and a bonus turn;
   - liquidation-created locks.
9. A replay test over a log with `ChargeDue`/`ChargePaid`, a locked redeem rejection and a bank bankruptcy.
10. Server integration tests:
    - a `core-7` snapshot (prisoner plus mortgage) loads under `core-8`, and play continues;
    - after new commands and a restart without a shutdown snapshot, the `core-7` snapshot plus the new tail replays exactly;
    - a diverging old tail ends as a failed room with the error logged.
11. `pnpm build`, `pnpm test`, `pnpm test:integration`, client lint, and `openspec validate --all --strict` pass. CI is 4/4 on the exact head, and the stage 4-5 browser suites are green.

## Scope and non-goals

In scope:
- `packages/game-core`: `debt.ts`, `rent.ts` (`settleMandatory` wiring), `mortgage.ts`, `houses.ts` (guards), `state.ts`, `invariants.ts`, `projection.ts`, `lifecycle.ts` (version), `money.ts` (reasons), index exports;
- the matching `packages/protocol` types or version;
- `apps/server`: the room load path for `upgradeState`, and its tests;
- the minimal `apps/client` typing changes needed to compile (for example, a nullable `creditorId` in event descriptions, where the bank shows as "банк").

Not in scope:
- casino, chance and jail (TASK-s6-core-cells);
- any client UI for charges or locks (TASK-s6-client);
- removing the interim jail;
- new browser scenarios.

## Canonical references

- `docs/efforts/stage-6-special-cells.md` rev 1 (C6, C9, C12-C15, C18, C19).
- `docs/efforts/stage-6-special-cells/design.md`.
- `docs/efforts/stage-5-mortgage-debts-bankruptcy.md` rev 2 and its design (I3 bankruptcy, liquidation order).
- `openspec/specs/` (game-core debt, mortgage, rent; server recovery).

## Constraints and invariants

- The core is deterministic: no time or randomness outside `TransitionContext`.
- Money is integer quanta (`Q`), never floating point.
- Replay stays exact.
- The stage 5 liquidation order and the rent semantics are unchanged.
- A PR may not weaken an existing test to pass.

## Dependencies

None upstream. TASK-s6-core-cells builds on this task's `settleDebt` creditor, `charge`, `upgradeState` chain and reasons. Keep those APIs as described in the design, or report any change.

## Delegated decisions

The Engineer decides:
- internal helper names and file layout;
- the exact `ChargeDue` payload, as long as it carries the payer, amount and cause;
- whether `PAYMENT_PENDING` is a new code or shared;
- the test fixture style.

Return to the TL:
- any change to the stage 5 settlement semantics;
- a stored-game case the design does not cover;
- any need to touch the stage 4-5 browser specs.

## Required workflow

Explore -> Propose (OpenSpec change `s6-core-payments`) -> Apply in a fresh context after TL approval -> Verify -> PR -> independent review -> review fixes. Archive the OpenSpec change in the PR, with mechanical archive reproduction, before the final exact-head review. **Do not merge**: the TL merges via `pr-merge-gate`.

## Required checks

Everything in criteria 8-11. In the PR body, list:
- every guard and code added;
- the `upgradeState` mapping;
- the replay-test events;
- the CI run on the exact head.

## Escalation conditions

Escalate to the TL if:
- a stage 4-5 test needs to change;
- the bank-creditor bankruptcy cannot follow stage 5 I3;
- an invariant conflicts with the design;
- the server load path cannot apply the upgrade without a schema change.

## Deliverables

- The branch `agent/task-s6-core-payments` and its PR.
- The archived OpenSpec change.
- Test evidence in the PR body.
- The independent review report.
- Residual risks.
