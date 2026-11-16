# Tasks

## 1. Contracts and purchase

- [ ] 1.1 Add TL-approved acquisition interfaces, genesis fields and turn pause field; set core-5 as sole supported version (engine/game-lifecycle: Genesis state, Game phases, Rules version gate). Verify state/lifecycle/version tests and typecheck; document exports in index.ts.
- [ ] 1.2 Implement checked debit and purchase commands in the purchase-auction module (engine/economy: Every balance change emits an event; engine/purchase-auction: Purchase commands). Verify affordable/exact-balance/unaffordable purchase, null payload, missing decision, actor, phase, deadline and target rejections with unchanged RNG/state on rejection.
- [ ] 1.3 Wire landing offers into normal and interim-jail release rolls (engine/purchase-auction: Free asset landing decision; engine/turn-cycle: Movement on CLASSIC_40). Verify all asset classes, owned assets, lap reward ordering, failed jail attempt, third double, release and automatic continuation; update relevant turn test helpers without weakening assertions.

## 2. Auction progression and clocks

- [ ] 2.1 Implement opening, nextBidAmount, fixed raises, pass, advancement and settlement in the purchase-auction module (engine/purchase-auction: Cyclic auction opening through Auction settlement). Verify 2..6 players, positive amounts for every price, exact raises, null payload, insufficient funds, cyclic order, leader skipping, all-pass, one-bid win, reservation replacement and single debit.
- [ ] 2.2 Register auction commands and Timeout dispatch with fresh auctionResponse targets (engine/purchase-auction: Response authorization and timing; engine/deadlines: Player commands strictly before the deadline, Pending deadlines for the host). Verify wrong actor, malformed payload, wrong phase/target, deadline -1/at/+1, auto-pass and stale/duplicate response behavior.
- [ ] 2.3 Integrate pause/resume and deferred closure using closeTurn (engine/turn-cycle: Ending a turn, Auction pauses the turn; engine/deadlines: Timeout after the roll closes the turn, Paused turn timeout rejection). Verify remaining-time arithmetic, sole pending auction timer, conflicting turn commands, paused turn Timeout rejection, all three origins, fresh bonus turn and continuation semantics.

## 3. Resignation, invariants and public view

- [ ] 3.1 Implement provisional resignDuringPurchase policy and deferred resigned resolution (engine/resignation: modified requirements and Provisional auction resignation policy). Verify cases (a)-(d), leader-owner void, non-responder departure preserving response deadline, successor also departing, bonus cancellation, immediate victory and no remaining deadlines.
- [ ] 3.2 Extend acquisition and phase invariants (engine/purchase-auction: Ownership invariants; engine/resignation: Permanent elimination). Verify invalid owners, mutual exclusion, position mismatch, ineligible responder, unaffordable leader and pause mismatch are rejected; only the approved eliminated-owner-with-paused-auction exception is accepted.
- [ ] 3.3 Classify/export new public state and events (engine/projection: State projection hides secrets, Event projection fails closed, Public acquisition data is detached). Verify all viewer classes, detached JSON data, no RNG leaks and complete event visibility with typecheck and projection tests.

## 4. Replay and integration verification

- [ ] 4.1 Extend golden/property command generation with acquisition commands and nonzero coverage assertions (engine/purchase-auction: Acquisition replay and snapshot restoration). Verify identical full state/events/RNG for live and replay and mid-decision/mid-auction JSON snapshot-tail restoration, including deferred resignation, fresh response ids and pendingDeadlines.
- [ ] 4.2 Run pnpm build, pnpm test, openspec validate --all --strict and git diff --check; inspect final diff against all 14 task criteria. Report each required mechanical external fixture update; if the Compose seed scenario changes, record and verify the test-data re-pin per the handoff.

## Workflow follow-up

- Team Lead approves this proposal; Apply starts in a fresh Engineer context with acknowledged task revision 2 and these artifacts.
- Commit on agent/task-s3-core; use agentctl intent/perform/verify/confirm records for push and PR, and never push to main.
- Open PR and request independent review through the prescribed reviewer handoff; collect both CI jobs on the exact head and address findings.
- After review passes, archive this OpenSpec change in the PR, rerun checks and refresh exact-head review/CI evidence as needed.
- E1 must be recorded in an effort handoff revision or ROADMAP before merge; report any policy adjustment and await Team Lead technical acceptance. Engineer does not merge.
