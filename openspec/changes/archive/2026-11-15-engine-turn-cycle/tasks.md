# Tasks

All paths are under `packages/game-core/src`. After each group: `pnpm -r exec tsc --noEmit` and `pnpm --filter @game/game-core test` pass.

## 1. State, board and guard foundations

- [x] 1.1 Extend `state.ts` with phase `playing`, `setup`, `order`, `turn`, `positions`, `jail` (design D2) and `genesis()` defaults; classify every new key `public` in `projection.ts` `STATE_VISIBILITY` (spec: engine/projection "State projection hides secrets"). Verify: `tsc --noEmit` passes; `projection.state.test.ts` asserts the new keys are present and `rng` absent.
- [x] 1.2 Add `board.ts` with `PLACEHOLDER_RING` and its placeholder marker and comment (design D1; spec: engine/turn-cycle "Movement on the placeholder ring"). Verify: vitest asserts size 40, cell 0 `start`, exactly one `jail` cell, `placeholder: true`.
- [x] 1.3 Add the `targetsGuard` variant to `registry.ts` and its branch in `checkExpectation` (design D4; spec: engine/command-execution "Target guard"). Verify: `guard.target.test.ts` gains fixture-registry cases for a matching entry, a wrong id, a wrong kind, an empty list and a revision expectation, each reference-equal on rejection.
- [x] 1.4 Add `phase-state-shape` and `ring-position` invariants to `invariants.ts` (design D8; spec: engine/command-execution "Invariant enforcement"). Verify: `state.test.ts` cases for each broken shape and for cell 40 raise `InvariantViolationError` with the right name.
- [x] 1.5 Bump `SUPPORTED_RULES_VERSIONS` to `['core-2']` and update fixtures and existing tests from `core-1` (spec: engine/game-lifecycle "Rules version gate"). Verify: a test that `core-1` is rejected with `UNSUPPORTED_RULES_VERSION`; full suite green.

## 2. Deadlines contract

- [x] 2.1 Add `deadlines.ts` with `SETUP_ROLL_DURATION_MS`, `TURN_DURATION_MS`, `CONTINUATION_MS`, `PendingDeadline`, `pendingDeadlines(state)` (spec: engine/deadlines "Pending deadlines for the host"). Verify: vitest on hand-built `lobby`, `setup`, `playing` states.
- [x] 2.2 Add a test helper module `__tests__/helpers/dice.ts`: deterministic entropy search that forces the next die / dice pair, and a builder that runs `CreateGame/AddPlayer/StartGame` on a session (design D10). Verify: its own vitest proves forced dice for all 36 pairs and all 6 single values.

## 3. Setup order rolls (spec: engine/turn-order; engine/game-lifecycle "Start game", "Game phases")

- [x] 3.1 Make `StartGame` open the first order roll (`OrderRollStarted`); add `setup.ts` with `RollForOrder` and the setup branch of `Timeout`, building `gameEngine` from the merged registry in `rules.ts` (design D1-D3, D5). Verify: `setup.test.ts` covers every turn-order scenario (first roller, out-of-turn, recorded roll, tie of two among three, first unresolved group first, repeated tie, two players no tie, Timeout rolls with `auto: true`); `lifecycle.test.ts` updated for the two `StartGame` events.
- [x] 3.2 Classify the setup events in `EVENT_VISIBILITY`. Verify: `tsc --noEmit`; `projection.events.test.ts` projects setup events unchanged.

## 4. Turn cycle (spec: engine/turn-cycle; engine/deadlines)

- [x] 4.1 Add `turns.ts` with `RollDice`, `EndTurn`, the turn branch of `Timeout`, `applyRoll`, `closeTurn`, `startTurn` and the no-op `settleMandatory` hook (design D5, D6). Verify: `turns.test.ts` covers owner-only, roll once, wrap-around movement, end turn, end before roll, fresh quotas, unchanged quotas on continuation.
- [x] 4.2 Doubles and the third-double jail send. Verify: `doubles.test.ts` covers manual double → bonus on `EndTurn`, manual double → bonus on `Timeout`, automatic double → bonus after the continued turn closes, streak reset on non-double and on turn passing, third double manual and automatic (exact event list, no `PlayerMoved`, no continuation).
- [x] 4.3 Deadline boundaries. Verify: `deadlines.test.ts` runs each of `RollForOrder`, `RollDice`, `EndTurn` at `deadline - 1` (accepted), `deadline`, `deadline + 1` (`DEADLINE_PASSED`), and `Timeout` for `setupRoll` and `turn` at `deadline - 1` (`DEADLINE_NOT_REACHED`), `deadline`, `deadline + 1` (accepted), plus a stale-turn `Timeout` (`TARGET_MISMATCH`) and continuation deadline = T + 20 000.
- [x] 4.4 Classify the turn events in `EVENT_VISIBILITY`. Verify: `tsc --noEmit`; projection test over a seeded game's events.

## 5. Prior jail (spec: engine/special-cells)

- [x] 5.1 Add `jail-attempt module` with the three-attempt jail rule (marked temporary) and `resolveJailAttempt`, wired into `applyRoll` (design D1, D6). Verify: `jail-attempt tests` covers prisoner not skipped, release by double without bonus, two failed attempts without movement, third failed attempt moves by its sum, automatic attempt with continuation, jail roll does not count toward the streak.

## 6. Session restore (spec: engine/session "Restore from snapshot and tail", "Restore divergence is reported")

- [x] 6.1 Add the optional initial state to `createSession`, `restoreSession`, and route `replay` through it (design D7). Verify: `session.restore.test.ts` covers restore equals live, further commands give equal results, empty tail, tail not following the snapshot (index 0), tampered events and entropy (named index); existing `session.replay*.test.ts` stay green.

## 7. Exports and integration proof

- [x] 7.1 Export the new types, constants and functions from `index.ts` (names in proposal "Names published for TASK-s1-protocol"). Verify: `pnpm build` passes for every workspace package.
- [x] 7.2 Extend `session.replay.property.test.ts` to random interleavings of all seven commands with times around deadlines, and to compare live, re-submitted, `replay` and `restoreSession` at a random split; assert coverage counters (games reaching `playing`, third-double jail sends, jail releases of both kinds, continuations, bonus turns). Verify: the test passes and the counters exceed their thresholds.
- [x] 7.3 Add a seeded multi-turn replay test pinning a golden summary of a fixed 300-command game. Verify: passes and is stable across two runs.
- [x] 7.4 Run `pnpm build`, `pnpm test`, `git diff --check` and `openspec validate engine-turn-cycle --strict`; record results as task evidence.

## Workflow follow-up

- Open the PR on `agent/task-s1-core-turns`, get independent review and green CI on the head SHA.
- Archive the change after merge according to project policy.
