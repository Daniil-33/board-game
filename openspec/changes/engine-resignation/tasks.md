# Tasks

## 1. State and lobby lifecycle

- [x] 1.1 Add eliminated/winner genesis defaults and finished Phase in state.ts, update visibility and state fixtures together (engine/command-execution "Winner invariants", engine/projection "State projection hides secrets"); verify genesis/projection tests and game-core tsc --noEmit.
- [x] 1.2 Implement revision-guarded system LeaveLobby, event/type exports and core-3 gate in existing lifecycle/projection/index modules (engine/game-lifecycle "Leave a lobby", "Rules version gate"); verify removal to empty, survivor order, malformed/missing member, actor/phase/revision rejections, start limits and own-key-safe ids with unchanged RNG on rejection. Update game-core version fixtures and public API docs/comments; run focused tests and typecheck.

## 2. Resignation and state-machine integration

- [x] 2.1 Factor setup advancement and add participant removal in setup.ts (engine/resignation "Setup resignation preserves surviving progress", "Setup roller replacement"); verify seeded tests for current/noncurrent roller, already rolled participant, tie rerolls, singleton/empty group cleanup, shifted group index, final order and preserved versus fresh targets/deadlines, including prototype-like player ids. Run setup tests and typecheck.
- [x] 2.2 Extend existing turn closure for reason resigned, suppressed bonus and optional terminal closure (engine/resignation "Resignation closes an owned turn", "Other player's turn survives"); verify focused turn-helper tests for pre-roll, double, continuation, cyclic successor and no bonus, while existing turn/doubles/jail tests still pass. Run typecheck.
- [x] 2.3 Add resignation.ts coordinator, register/export Resign and public events, and classify events (engine/resignation "Voluntary resignation", "Permanent elimination", "Last active player wins", "Finished games reject further actions"); verify scenario tests for all turn/setup/jail cases, repeat/malformed/unknown actors and stale revisions, before/at/after deadlines, all three victory event sequences, no new turn on victory and stale timeouts. Verify unrelated preserved targets still work, projection is detached/public and rejections preserve input state/RNG. Run typecheck and document new exports in source comments.
- [x] 2.4 Update invariants for active membership, phase shapes and winners (engine/command-execution "Invariant enforcement", "Active membership invariants", "Winner invariants"); verify accepted flows pass and deliberately malformed states with eliminated positions, jail, order/turn ownership, setup membership and invalid winners throw invariant violations. Run focused tests and typecheck.

## 3. Determinism and recovery

- [x] 3.1 Extend replay/property generators with LeaveLobby and Resign, finished-state command rejection and explicit coverage counters while retaining long non-resignation traces (engine/resignation "Resignation replay and restoration"); verify seeded runs cover both new commands, setup/playing victories, deduplication, state/RNG equality and existing doubles/jail paths.
- [x] 3.2 Extend session replay/restore scenarios across setup/playing resignation and victory, with snapshot cuts before/after removal (engine/resignation "Resignation replay and restoration", "Finished games reject further actions"); verify full state, events, RNG, pending deadlines and later commands match live sessions, including duplicate accepted command semantics after victory.

## 4. Integration verification and delivery

- [x] 4.1 Run pnpm build, pnpm test, OpenSpec validate engine-resignation --strict and git diff --check over the branch range; compare final diff against all nine handoff acceptance criteria and record command results with agentctl. Report cross-package integration failures without changing files outside the assigned scope.
- [ ] 4.2 Rebase on current main and inspect the final scope, then commit/push feature branch and open PR through the agentctl external-operation intent/verify/confirm protocol; verify exact-head green CI and record SHA/PR/evidence, requesting independent review through the required Engineer-to-Reviewer handoff.
- [ ] 4.3 Address supported review findings, rerun affected checks and obtain exact-head independent review and Team Lead acceptance; record remaining risks and evidence with agentctl.

## Workflow follow-up

- Apply begins only after Team Lead proposal approval in a fresh Engineer context, as required by task revision 1.
- Team Lead authorized sync/archive of engine-turn-cycle as the first Apply commit (0907356), completed before implementation. Keep engine-resignation active; coordinate its sync/archive after merge. Do not merge autonomously.
