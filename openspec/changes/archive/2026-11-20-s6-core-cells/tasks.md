# Tasks

## 1. Core special-cell transitions

- [x] 1.1 Add casino state, public events, `casinoCap`, bet and decline commands with the specified guard order, RNG draw and balance event order. Cover caps for 2–6 players, amount bounds, both outcomes, decline, automatic decline, and payment pending. (Specs: `engine/special-cells`, `engine/turn-cycle`.)
- [x] 1.2 Add deterministic chance draws and route gains/losses through balance credit or the existing bank charge. Cover every card, explicit/automatic payment and bank bankruptcy. (Specs: `engine/special-cells`, `engine/turn-cycle`.)
- [x] 1.3 Add the shared `landOn` dispatcher and route every move through it. Cover normal movement, jail releases, cell 30 reached by a double, cell 10 visit, and casino/chance reachable from a release. (Specs: `engine/special-cells`, `engine/turn-cycle`.)

## 2. Final jail rules and interim removal

- [x] 2.1 Add `jailFee`, voluntary `PayJailFee`, double release, failed attempt, third-failure forced bank settlement, timeout behavior and no-move bankruptcy handling. Cover each accepted jail path and movement landing effects. (Specs: `engine/special-cells`, `engine/turn-cycle`.)
- [x] 2.2 Remove prior jail code, events, types, protocol fields/text and client temporary descriptions. Keep the `JailEntry` shape `{attemptsUsed}`. (Specs: `engine/special-cells`, `engine/turn-cycle`.)

## 3. Versioning, projection and protocol

- [x] 3.1 Bump to `core-9`, chain `core-7 → core-8 → core-9`, handle genesis unchanged, and test upgrade identity, retained prisoner attempts and neutral casino state. (Spec: `engine/game-lifecycle`.)
- [x] 3.2 Project casino publicly, classify every new event, export `jailFee` and `casinoCap`, add command/event schemas, and bump `PROTOCOL_VERSION` once. Update only the client compilation and localized journal descriptions. (Specs: `engine/projection`, `protocol/frames`.)
- [x] 3.3 Add a deterministic replay case containing every new event and assert exact state/event equality. (Specs: `engine/special-cells`, `engine/projection`.)

## 4. Recovery and carried review findings

- [x] 4.1 Extend server recovery coverage for a prisoner with attempts, open casino offer, chance charge and redeem lock; cover `core-8 → core-9` upgrade, a genesis snapshot surviving shutdown/restore, and the `tailIndex: 1` / `errorCode: 'REDEEM_LOCKED'` divergence assertions. (Spec: `server/recovery`.)

## 5. Seeded browser regression and verification

- [x] 5.1 Update the shared seed 6689 stream to seed 129, assert the first final-rule jail failure as `JailAttemptFailed`, and run the full seeded job locally 10 times through the UI. All 10 passed with no reproduced flake; poll lengths unchanged. (Specs: `engine/special-cells`, `engine/turn-cycle`.)
- [ ] 5.2 Run the required build, unit and integration tests, client lint, strict OpenSpec validation, stage 3–5 browser suites, and verify CI 4/4 on the exact PR head. Include every existing test adjustment and its reason in the PR body. (All specs in this change.)

## Delivery

- Archive this OpenSpec change in the PR before requesting final exact-head independent review. Open the PR from `agent/task-s6-core-cells`; do not merge.
