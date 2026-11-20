# Tasks

## 1. Bank creditor debt settlement

- [x] 1.1 Generalize debt settlement to player or bank creditors while preserving rent behavior; add exact-balance core tests for bank cash payment, tiered liquidation, and bankruptcy with houses, including nullable creditor events and assets released free. Verify with the focused debt tests. (Spec: `engine/debt-settlement`.)

## 2. Mandatory bank charge

- [x] 2.1 Add the exclusive charge state, pure opener, ChargeDue/ChargePaid events, PayCharge command and shared turn-closure settlement; extend payment guards while retaining rent guard codes. Add tests for explicit payment, EndTurn, deadline, bankruptcy, charge invariants, and C13 own-turn/auction precedence. Verify with focused core tests and replay. (Specs: `engine/rent-building`, `engine/debt-settlement`.)
- [x] 2.2 Add a deterministic replay test containing ChargeDue/ChargePaid, a rejected same-turn redeem, and bank bankruptcy; assert replayed state and events equal live execution. Verify with the focused replay test. (Specs: `engine/rent-building`, `engine/mortgage`, `engine/debt-settlement`.)

## 3. Mortgage redeem lock

- [x] 3.1 Add lockedTurnId to mortgage state and public projection; set it for manual and liquidation mortgages and enforce REDEEM_LOCKED in the current turn. Test same-turn rejection, next regular turn, bonus turn, and liquidation-created locks; verify projection exposes the field. (Spec: `engine/mortgage`.)
- [x] 3.2 Prove off-turn build, sale, mortgage and redeem reject with NOT_ACTIVE_PLAYER during another player's open rent, while AUCTION_IN_PROGRESS precedence remains unchanged. Verify focused command tests; keep existing stage 4-5 scenarios intact. (Specs: `engine/rent-building`, `engine/mortgage`.)

## 4. Rules version and core upgrade

- [x] 4.1 Bump the current rules version to core-8 and export pure upgradeState for core-7-to-core-8 mapping and core-8 identity. Test prisoner/mortgage preservation, neutral fields, version, identity, and unsupported inputs. Verify with lifecycle and invariant tests. (Spec: `engine/game-lifecycle`.)

## 5. Protocol and client typing

- [x] 5.1 Add PayCharge to protocol command schemas, update view/event types for charge, nullable creditors and lockedTurnId, bump PROTOCOL_VERSION once, and make only the client compile/description changes required. Add protocol round-trip tests for the new command and events. Verify protocol tests and client lint. (Spec: `protocol/frames`.)

## 6. Server snapshot upgrade and recovery

- [x] 6.1 Apply upgradeState to every loaded snapshot before restoreSession. Add integration coverage for a core-7 prisoner plus mortgage that continues under core-8, a current-rule tail replayed after restart without a shutdown snapshot, a diverging core-7 tail after a core-7 snapshot producing a logged failed room without row changes, and a core-7 log-only room failing at genesis with rows unchanged. Verify with server integration tests. (Spec: `server/recovery`.)

## 7. Integration verification

- [x] 7.1 Run `pnpm build`, `pnpm test`, `pnpm test:integration`, client lint, `openspec validate --all --strict`, and the stage 4-5 browser suites; record each result and confirm existing stage 4-5 core tests pass unchanged. Verify CI is green 4/4 on the exact PR head. (Specs: all capabilities in this change.)

## Workflow follow-up

- Archive `s6-core-payments` in the PR after implementation and required local checks, preserving mechanical archive reproduction.
- Open the PR from `agent/task-s6-core-payments`; do not merge. Request independent review and address supported findings before reporting completion.
