# Tasks

## 1. Contract changes (spec: engine/contracts)

- [x] 1.1 In `src/types.ts`, change `Timestamp` to `Brand<number, 'Timestamp'>` and add `timestamp(ms)`, which throws on non-integer or negative input (spec: engine/contracts "Timestamp representation"). Verify with `money.test.ts`-style vitest cases (`timestamp(0)`, `timestamp(1.5)` throws, `timestamp(-1)` throws, numeric `<` ordering) and a `types.brands.fail.ts` case where assigning a plain `number` to `Timestamp` fails `tsc --noEmit`
- [x] 1.2 In `src/engine.ts`, add the `Actor` union and replace `actorId` with `actor` in `GameCommand` (spec: engine/contracts "Command idempotency envelope"). Verify with a `types.brands.fail.ts` case where a bare `PlayerId` assigned to `actor` fails to compile, and a passing compile of a system-actor command with no `PlayerId`
- [x] 1.3 In `src/context.ts`, remove `rng` and `DeterministicRng` from `TransitionContext`, leaving `{ now: Timestamp }` (spec: engine/contracts "Deterministic transition context"). Update `contracts.fixture.test.ts` to the new context and envelope, and update the `index.ts` exports. Verify `pnpm -r exec tsc --noEmit` passes and the fixture test passes
- [x] 1.4 Make `boundary.test.ts` scan every non-test `.ts` file under `src/` instead of a fixed list (spec: engine/contracts "No global random access"). Verify that temporarily adding `Math.random` to a new file makes the test fail, and that it passes again once removed

## 2. Pure RNG (spec: engine/contracts "Deterministic transition context")

- [x] 2.1 Implement `src/rng.ts`: `seedRng(seed)` (splitmix32 expanding into four words), `nextUint32`, and `nextIntInclusive` with rejection sampling, using `Math.imul`/`>>> 0` only. Verify with vitest: a frozen golden vector of the first 8 outputs for seed 42; the same seed gives deep-equal output; the input RNG object is unchanged after a draw; `nextIntInclusive(rng, 1, 6)` over 60 000 draws has every face within ±5% of 10 000 and never leaves `[1, 6]`

## 3. State and invariants (spec: engine/game-lifecycle "Genesis state", "Game phases"; engine/command-execution "Invariant enforcement")

- [x] 3.1 Implement `src/state.ts` with `GameState` (`revision`, `rulesVersion`, `phase`, `players`, `rng`), `Phase` (`'uninitialized' | 'lobby' | 'setup'`), and `genesis()`. Verify with a vitest test that `genesis()` has revision 0, phase `uninitialized`, no players, and `rng === null`
- [x] 3.2 Implement `src/invariants.ts` with `checkInvariants(state)`, which throws `InvariantViolationError { invariant, detail }` for: revision not a non-negative integer; duplicate player ids; more than 6 players; fewer than 2 players in `setup`; `rng` null outside `uninitialized` or malformed. Verify with one vitest case per invariant plus a passing case for a valid state

## 4. Command execution engine (spec: engine/command-execution)

- [x] 4.1 Implement `src/registry.ts` with `CommandSpec` and `createEngine(registry)`, applying the check order: `UNKNOWN_COMMAND`, `REVISION_MISMATCH`, `ACTOR_NOT_ALLOWED`, `UNKNOWN_ACTOR`, `PHASE_NOT_ALLOWED`, then the handler. On handler success the engine sets `revision + 1`, runs `checkInvariants`, and returns `AcceptedResult` (spec: "Command dispatch by type", "Envelope check order", "Actor permissions", "Phase permissions", "Accepted transition bookkeeping"). Verify with vitest against a fixture registry:
  - each error code is returned in isolation;
  - a stale revision plus a wrong actor yields `REVISION_MISMATCH`;
  - a rejected result's state is reference-equal to the input;
  - events keep handler order;
  - revision N becomes N + 1 with `previousRevision` N.
- [x] 4.2 Add fixture-registry tests in `src/__tests__/registry.rng.test.ts` (spec: engine/contracts "Rejected command does not consume randomness"; engine/command-execution "Invariant enforcement"). Verify that:
  - a handler that draws and then rejects leaves `state.rng` reference-equal;
  - a handler that draws twice returns a state whose `rng` differs from the input and gets distinct values;
  - a handler returning duplicate players makes `execute` throw `InvariantViolationError`;
  - the same `(state, command, ctx)` executed twice gives deep-equal results.

## 5. Lifecycle commands (spec: engine/game-lifecycle)

- [x] 5.1 Implement `src/lifecycle.ts` with the `CreateGame`, `AddPlayer` and `StartGame` specs, `SUPPORTED_RULES_VERSIONS = ['core-0']`, and the default `gameEngine = createEngine(lifecycleCommands)`. Payload checks produce `INVALID_PAYLOAD`, `INVALID_SEED`, `UNSUPPORTED_RULES_VERSION`, `DUPLICATE_PLAYER`, `PLAYER_LIMIT_REACHED` and `NOT_ENOUGH_PLAYERS`. Verify with one vitest case per scenario in the engine/game-lifecycle spec, covering:
  - seed bounds `0`, `2^32 − 1`, `2^32`, `1.5`;
  - a 7th player;
  - a player actor issuing `AddPlayer`;
  - any command in `setup`;
  - `GameCreated.createdAt` equal to `ctx.now`;
  - the same seed giving deep-equal `rng`.
- [x] 5.2 Export `genesis`, `gameEngine`, `createEngine`, the RNG helpers, the error classes and the state types from `src/index.ts`. Verify `pnpm -r exec tsc --noEmit` passes, including `apps/server`

## 6. Session and replay (spec: engine/session)

- [x] 6.1 Implement `src/canonical.ts` with `isPlainData(value)` and `canonicalJson(value)` (recursively sorted keys). Verify with vitest: key order does not change the output; functions, `undefined`, `NaN` and `Infinity` are rejected by `isPlainData`; nested arrays keep their order
- [x] 6.2 Implement `createSession(engine)` in `src/session.ts` with `state`, `log` and `submit(cmd, ctx)`. It does the plain-data check (`INVALID_PAYLOAD`), keeps the fingerprint index (duplicate returns the stored result, otherwise `COMMAND_ID_CONFLICT`), and logs accepted commands only (spec: "Session holds current state", "Accepted-command log", "Repeated command returns the original result", "Command id conflict", "Rejected command ids are not remembered", "Payload must be plain data"). Verify with one vitest case per scenario in those requirements
- [x] 6.3 Implement `replay(engine, log)` and `ReplayDivergenceError { index, reason }` in `src/session.ts` (spec: "Deterministic replay", "Replay divergence is reported"). Verify with vitest that:
  - replaying a 2-player create/add/add/start log gives a state deep-equal to the original;
  - the replayed session dedups a logged `commandId`;
  - tampered events throw at the right index;
  - an unsupported `rulesVersion` throws at index 0.

## 7. Integration check

- [x] 7.1 Add `src/__tests__/session.replay.property.test.ts`. It generates 200 random command sequences from a fixed test seed (valid and invalid lifecycle commands, duplicates, id conflicts, stale revisions), runs each through a session, replays the log, and asserts deep-equal state and events, `revision === log.length`, and no thrown invariant errors. Verify vitest passes, then `pnpm -r exec tsc --noEmit` and `pnpm -r test` both pass

## Workflow follow-up

- Run `openspec validate engine-state-and-command-execution --strict` before archiving.
- Archive the change once all tasks are checked off.
