# Tasks

## 1. Entropy in the context (spec: engine/contracts "Deterministic transition context"; engine/command-execution "Entropy absorption on acceptance")

- [x] 1.1 In `src/types.ts`, add the `Entropy` brand (a 4-tuple of u32) and `entropy(words)`. It throws `RangeError` unless given exactly 4 integers in [0, 2^32 − 1] (design D1). Verify:
  - vitest cases: a valid tuple, 3 or 5 words, `-1`, `2^32`, `1.5`;
  - a `types.brands.fail.ts` case where a plain `number[]` assigned to `Entropy` fails `tsc --noEmit`.
- [x] 1.2 In `src/rng.ts`, add `absorbEntropy(rng, e)` as the chained splitmix32 hash of `s[i] ^ e[i]`, with the all-zero guard (design D2). Verify with vitest:
  - a frozen golden vector for `absorbEntropy(seedRng(42), entropy([1, 2, 3, 4]))`;
  - the input RNG object is unchanged;
  - an all-zero input state and all-zero entropy still produce a well-formed RNG;
  - for 32 sampled bit positions, flipping one entropy bit changes every output word.
- [x] 1.3 In `src/context.ts`, add the required `entropy: Entropy` field. Update `__tests__/helpers/fixtures.ts` so `ctx(ms?, ent?)` supplies a fixed default entropy (design D7), and update `contracts.fixture.test.ts`. Export `Entropy` and `entropy` from `src/index.ts`. Verify that `pnpm -r exec tsc --noEmit` passes, including `apps/server`, and that the existing vitest suite still passes.
- [x] 1.4 In `src/registry.ts`, absorb `ctx.entropy` into `state.rng` after the envelope checks and before the handler, but only when `rng !== null`. Return the original state object on any rejection (spec: engine/command-execution "Entropy absorption on acceptance"). Verify with vitest against a fixture registry and the lifecycle registry:
  - the same `AddPlayer` with two entropies gives different RNG states;
  - `CreateGame` with two entropies gives deep-equal RNG states;
  - a handler that draws and then rejects returns a state reference-equal to the input;
  - a drawing handler with the same state, command and context twice gives deep-equal results;
  - the same drawing command with two entropies gives different draws.
- [x] 1.5 In `src/lifecycle.ts`, set `SUPPORTED_RULES_VERSIONS = ['core-1']` (design D3), and switch fixtures and tests from `'core-0'` to `'core-1'`. Verify with a vitest case that `CreateGame` with `'core-0'` is rejected with `UNSUPPORTED_RULES_VERSION`, and that the full suite passes.

## 2. Entropy in the session log (spec: engine/session "Accepted-command log", "Repeated command returns the original result", "Deterministic replay")

- [x] 2.1 In `src/session.ts`, add `entropy` to `LogEntry`, recorded as a detached frozen copy. Make `replay` submit `{ now, entropy }` from each entry, and keep the context out of the fingerprint (design D5). Verify with vitest:
  - a log entry contains the context's entropy, and mutating the caller's entropy array afterwards does not change the log;
  - resubmitting an accepted command with different entropy returns the original result, and the state's `rng` stays reference-equal;
  - replaying a create/add/add/start log gives a final state deep-equal to the original, including `rng`;
  - altering the entropy of the `AddPlayer` entry before replay gives a different final `rng`.

## 3. Concurrency guards (spec: engine/contracts "Command idempotency envelope"; engine/command-execution "Envelope check order", "Revision guard", "Target guard")

- [x] 3.1 Swap the envelope to `expected` and add revision guards (design D4, D5):
  - **`src/engine.ts`:** add `TargetRef` and `Expectation`, and replace `expectedRevision` with `expected` in `GameCommand`.
  - **`src/registry.ts`:** add `ConcurrencyGuard`, a required `guard` on `CommandSpec`, the `revisionGuard` helper, and step 2 `checkExpectation`, which never throws on malformed input.
  - **`src/lifecycle.ts`:** declare `revisionGuard` on all three commands.
  - **`src/session.ts`:** fingerprint `expected`.
  - **Fixtures:** `cmd(..., { rev | target })` builds `expected`.

  Verify:
  - `types.brands.fail.ts` cases: a bare `Revision` assigned to `expected` fails to compile, and a `CommandSpec` literal without `guard` fails to compile;
  - vitest: `AddPlayer` with `rev − 1` gives `REVISION_MISMATCH`;
  - vitest: a target expectation on a revision-guarded command gives `REVISION_MISMATCH`;
  - vitest: `expected: null` and `{ kind: 'revision' }` without a revision both give `REVISION_MISMATCH` without throwing;
  - vitest: the same `commandId` with a different `expected` gives `COMMAND_ID_CONFLICT`;
  - `pnpm -r exec tsc --noEmit` and the existing suite pass.
- [x] 3.2 Add the `targetGuard(kind, currentTarget)` helper and its branch in `checkExpectation`, returning `TARGET_MISMATCH` (spec: engine/command-execution "Target guard"). Verify with vitest against a fixture registry whose state has a fixture current-target. Cases:
  - a matching target is accepted at a revision several steps past the one the author saw, and the handler sees the current state;
  - a different id gives `TARGET_MISMATCH`;
  - no current target (`currentTarget` returns null) gives `TARGET_MISMATCH`;
  - a revision expectation equal to the current revision gives `TARGET_MISMATCH`;
  - a wrong target kind gives `TARGET_MISMATCH`;
  - a stale target plus a disallowed actor gives `TARGET_MISMATCH`, not `ACTOR_NOT_ALLOWED`;
  - the state is reference-equal on every rejection.

  Export the guard types and helpers from `src/index.ts`.

## 4. Projection (spec: engine/projection)

- [x] 4.1 Add a new `src/projection.ts` with `Viewer`, `Visibility`, `STATE_VISIBILITY` (checked with `satisfies Record<keyof GameState, Visibility>`), the derived `StateView` type, and `projectState(state, viewer)`. `projectState` copies only the map's public keys, and a non-member player viewer is treated as a spectator (design D6; spec "Viewers", "State projection hides secrets", "Projection is plain data", "Every state field is classified"). Verify:
  - vitest: for `lobby` and `setup` states, the views for a player and a spectator contain no `rng` key, and none of the RNG words appear in `JSON.stringify(view)`;
  - vitest: the view carries `revision`, `rulesVersion`, `phase` and `players` unchanged;
  - vitest: the view for a non-member player is deep-equal to the spectator view;
  - vitest: a JSON round-trip of the view is deep-equal to it, and the state is unchanged after projection;
  - `types.brands.fail.ts`: a visibility map typed against `GameState & { extra: number }` but missing `extra` fails `tsc --noEmit`.
- [x] 4.2 In `src/projection.ts`, add `EVENT_VISIBILITY` for the lifecycle event types, `projectEvents(events, viewer)` that preserves order, and `UnclassifiedEventError` (spec "Event projection fails closed"). Verify with vitest:
  - the events of a create/add/add/start session, projected for a spectator, are deep-equal to the originals;
  - a list containing `{ type: 'Unknown' }` throws `UnclassifiedEventError` naming `Unknown`;
  - every event type produced by `lifecycleCommands` is present in `EVENT_VISIBILITY`.

  Export the projection API from `src/index.ts`.

## 5. Integration check

- [x] 5.1 Update `src/__tests__/session.replay.property.test.ts`:
  - each generated command gets per-command entropy from the fixed test seed;
  - generated cases include `expected` variants (stale, future, wrong kind, malformed).

  For every sequence, assert:
  - the replayed state and events are deep-equal to the original, including `rng`;
  - `revision === log.length`;
  - no invariant errors are thrown;
  - `projectState` of the final state never contains `rng`.

  Verify that this vitest passes, and that `pnpm -r exec tsc --noEmit` and `pnpm -r test` both pass, with the boundary test covering `projection.ts`.

## Workflow follow-up

- Run `openspec validate engine-multiplayer-readiness --strict` before archiving.
- Archive the change once all tasks are checked off.
- The next change (setup turn order and the turn cycle) uses `targetGuard` for turn-scoped commands. It must add the "target ids are never reused" requirement for its first target kind (design D4).
