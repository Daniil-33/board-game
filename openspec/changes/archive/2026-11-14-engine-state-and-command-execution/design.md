# Design

## Context

`packages/game-core` has contracts only: `context.ts` (`TransitionContext { rng, now }`), `engine.ts` (command envelope, results, `GameEngine`), `types.ts` (brands), `money.ts` (`Q`). The only engine is a stub inside `contracts.fixture.test.ts`. `boundary.test.ts` scans a hard-coded list of source files. `apps/server` only re-exports the `GameEngine` type. See proposal.md for motivation and specs/ for the required behavior.

## Goals / Non-Goals

**Goals:**
- One pure `execute(state, command, context)` that every future mechanic plugs into by registering a handler. No change to the engine is needed to add a command.
- Rejected commands cannot leak changes. This follows from the code's structure (handlers return new values), not from discipline.
- A session whose whole history is its log: log + genesis → identical state and events.

**Non-Goals:**
- Performance tuning (log compaction, snapshots, hashing fingerprints).
- A general event-sourcing framework. Events are outputs recorded for replay comparison; state is not rebuilt *from events*.
- Deep runtime freezing of state in production code.

## Decisions

### D1: Module layout

```
src/
  types.ts        brands (Timestamp -> number)          [changed]
  context.ts      TransitionContext { now }             [changed]
  engine.ts       envelope, Actor, results, GameEngine  [changed]
  rng.ts          pure xoshiro128** + helpers           [new]
  state.ts        GameState, Phase, genesis()           [new]
  invariants.ts   checkInvariants(state)                [new]
  registry.ts     CommandSpec, createEngine(registry)   [new]
  lifecycle.ts    CreateGame / AddPlayer / StartGame    [new]
  canonical.ts    plain-data check + canonical JSON     [new]
  session.ts      createSession, replay                 [new]
```

`createEngine(registry)` takes the registry as an argument, so tests can register fixture-only command types. These test the draw-then-reject behavior and the player-actor paths, which no lifecycle command exercises. The default `gameEngine` is `createEngine(lifecycleCommands)`.

### D2: RNG state lives in `GameState` (pure xoshiro128**)

`state.rng = { algo: 'xoshiro128**', s: [u32, u32, u32, u32] } | null`, which is `null` before `CreateGame`. The seed is expanded into the four words with splitmix32. The draw functions are pure:

```
nextUint32(rng)            -> [u32, rng']
nextIntInclusive(rng, lo, hi) -> [int, rng']   // rejection sampling, no modulo bias, no floats
```

They use `Math.imul` and `>>> 0` only, so the results are bit-identical on every JS engine. A handler threads `rng'` into the state it returns. A rejecting handler returns no state, so its draws are discarded automatically.

- *Why xoshiro128\*\* over mulberry32:* mulberry32 keeps a single 32-bit word of state and is known to skip outputs. xoshiro128\*\* is a standard generator with good statistical quality whose state is still four JSON-friendly integers.
- *Alternatives rejected (explored before the proposal):* keeping the RNG in the context and logging the drawn values, or having the session hold a cursor. Both left "no consumption on reject" to handler discipline, or split the source of truth between state and session.
- The output stream is frozen with a golden-vector test. Changing it means changing `rulesVersion`.

### D3: Actor is a discriminated union

```ts
type Actor = { kind: 'player'; id: PlayerId } | { kind: 'system' };
```

The registry declares `allowedActors: ReadonlySet<'player' | 'system'>` for each command type.

- *Alternative:* separate `PlayerCommand`/`SystemCommand` envelopes. Rejected because it would need two log shapes and two dispatch paths.
- *Alternative:* a sentinel `'SYSTEM' as PlayerId`. Rejected because it is a brand-bypassing cast.

### D4: Handler contract and check order

```ts
interface CommandSpec<S, C, E> {
  allowedActors; allowedPhases;
  handle(state, command, ctx): { ok: true; state: S; events: E[] } | { ok: false; error: EngineError };
}
```

`execute` runs the spec's fixed order: type, then revision, then actor kind, then membership, then phase, then the handler. Only after `ok: true` does the engine set `revision + 1`, run invariants, and build the `AcceptedResult`. Handlers never see or set `revision`, `commandId` or `previousRevision`. Each handler validates its own payload first; the session's plain-data check (D6) only ensures the payload *can* be fingerprinted.

### D5: Invariant violations throw

`checkInvariants` runs after every accepted handler. A failure throws `InvariantViolationError { invariant, detail }`.

- *Alternative:* reject with `INVARIANT_VIOLATION`. Rejected because an invalid state is a defect in our code, not a bad command. Reporting it as a rejection would let a host retry or ignore it, so the bug would go unnoticed. The input state is untouched either way, because transitions are pure.

### D6: Session = state + log + id index

```
session.submit(cmd, ctx)
  1. payload not plain data            -> Rejected INVALID_PAYLOAD
  2. fp = canonicalJson({type, actor, expectedRevision, payload})
  3. index.get(cmd.commandId)
       hit, same fp   -> return stored AcceptedResult
       hit, other fp  -> Rejected COMMAND_ID_CONFLICT
  4. r = engine.execute(state, cmd, ctx)
  5. accepted -> state = r.state; log.push({command, now, revision, events}); index.set(id, {fp, r})
```

- The canonical JSON uses recursively sorted object keys. Fingerprints are compared as strings, so there is no hash and no `crypto` import, which keeps the boundary test green.
- The stored result keeps the state from that revision. States are immutable and share structure, so the memory cost is one reference per command.
- The session is synchronous and single-threaded, so there are no interleavings to guard against.

### D7: Replay

`replay(engine, log)` creates a fresh session and submits each entry's command with `{ now: entry.now }`. For each entry it checks that the result is accepted and that the revision and events match the record (compared by canonical JSON). On any mismatch it throws `ReplayDivergenceError { index, reason }`. It returns the live session, so dedup and further commands work (spec: "Replay result is usable as a session").

### D8: Timestamp as branded epoch milliseconds

`Timestamp = Brand<number, 'Timestamp'>`. The only constructor is `timestamp(ms)`, which throws on non-integer or negative input. This mirrors `Q` being the only route to `Money`. Integer milliseconds make later deadline arithmetic (+45 s, +20 s) exact.

### D9: Rules version

`SUPPORTED_RULES_VERSIONS = ['core-0']`. It gets bumped whenever a change alters the transitions or the RNG stream. Old logs are then rejected rather than misread.

## Risks / Trade-offs

- [Breaking contract changes: `rng` removed, `actorId` replaced by `actor`, `Timestamp` becomes a number] → The only consumers are the in-repo fixture test and the server's type re-export; both are updated in the same change.
- [A hand-written PRNG with a subtle bug] → Golden-vector test plus a distribution sanity test for `nextIntInclusive`. Any later fix bumps `rulesVersion`.
- [Canonical JSON cost on every submit] → Payloads are tiny in the MVP. Hashing or memoising can come later without changing behavior.
- [The dedup index grows with the game] → It is bounded by the number of accepted commands, which the log already stores. Acceptable for in-memory MVP sessions.
- [Handlers forget to thread `rng'` and reuse the old RNG state] → A fixture test registers a handler that draws twice and asserts the values differ and the returned state carries the advanced RNG state. Future handler tests follow the same pattern.
- [Hard-coded file list in `boundary.test.ts` misses new modules] → Change it to scan every non-test `.ts` file under `src/`.

## Migration Plan

This is an in-repo breaking change with no released consumers. Update `contracts.fixture.test.ts` and `boundary.test.ts`, re-run `tsc --noEmit` for every workspace package, and run vitest. To roll back, revert the change.
