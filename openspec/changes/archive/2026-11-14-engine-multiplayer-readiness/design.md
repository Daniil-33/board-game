# Design

## Context

For motivation, see proposal.md (Why). For required behavior, see `specs/`.

The current `packages/game-core` looks like this:

- `context.ts`: `TransitionContext { now: Timestamp }`.
- `rng.ts`: pure xoshiro128**, seeded via splitmix32. The state is `{ algo, s: [u32 x4] }`, stored in `GameState.rng`.
- `engine.ts`: the envelope `{ type, commandId, actor, expectedRevision, payload }`.
- `registry.ts`: `createEngine(registry)`. It checks type → revision → actor kind → membership → phase, then calls `spec.handle(state, cmd, ctx)`. On acceptance it bumps the revision and runs `checkInvariants`.
- `session.ts`:
  - `LogEntry { command, now, revision, events }`;
  - the fingerprint is `{ type, actor, expectedRevision, payload }`;
  - `replay` re-submits each entry with `{ now: entry.now }`.
- `lifecycle.ts`: `CreateGame` / `AddPlayer` / `StartGame` and `SUPPORTED_RULES_VERSIONS = ['core-0']`.

The target deployment is a Room server that serializes every command of one game into one session. That means the core never sees concurrent calls. "Concurrency" here only means that clients act on views that are already stale.

```
 client --intent{type,commandId,expected,payload}--> Room
 Room: actor := authenticated identity
       ctx   := { now: clock(), entropy: csprng(128 bit) }
       result := session.submit(cmd, ctx)
       broadcast projectState(result.state, viewer_i), projectEvents(result.events, viewer_i)
```

## Goals / Non-Goals

**Goals:**

- Knowing a state snapshot, or the seed, never lets anyone predict the next draw.
- Commands that act on a specific game object can be guarded by that object instead of the global revision.
- Clients get data only through a projection that fails closed on unclassified data.
- Every new rule stays enforced by the engine or the type system, not by each handler remembering it.

**Non-Goals:**

- The Room implementation, transport, timers, and the actual CSPRNG call.
- Defining any real target kind (turn, auction, offer). Fixture target kinds in tests only.
- Per-viewer differences in the current data. Today every viewer sees the same public view.

## Decisions

### D1: Entropy is a branded 4-word tuple in the context

```ts
type Entropy = Brand<readonly [number, number, number, number], 'Entropy'>;
function entropy(words: readonly number[]): Entropy; // throws RangeError unless exactly 4 ints in [0, 2^32-1]
interface TransitionContext { readonly now: Timestamp; readonly entropy: Entropy }
```

- **128 bits match the xoshiro128\*\* state width.** The Room produces it with `crypto.getRandomValues(new Uint32Array(4))`, outside the core.
- **The field is required, with no default.** An optional entropy would quietly become "always zero" in some host path.
- **It is plain data, so it serializes into the log as is.**
- *Alternatives:*
  - A single u32: too small; it can be brute-forced against an observed outcome.
  - A hex string: needs parsing, and it is easier to get its length wrong.

### D2: The engine absorbs entropy into the state RNG before the handler runs

`rng.ts` gains `absorbEntropy(rng, e): RngState`, defined as a chained splitmix32 hash of the XOR:

```
acc = 0
for i in 0..3:                       // forward: word i depends on inputs 0..i
  s'[i] = splitmix32((rng.s[i] ^ e[i]) + acc >>> 0).out; acc = s'[i]
for i in 2..0:                       // backward: fold word 3 (depends on all) back
  s'[i] = splitmix32(s'[i] + s'[i+1] >>> 0).out
if s' is all zero: s' = [1,0,0,0]
```

`createEngine` applies it after the envelope checks pass, but only when `state.rng !== null`. The handler receives `working = { ...state, rng: absorbEntropy(state.rng, ctx.entropy) }`. Any rejection, from the envelope or the handler, returns the original `state` object. So the rule that a rejected command does not consume randomness still holds structurally, as it did in the previous change.

- **Why the engine does this rather than handlers:**
  - Absorption happens on every accepted command, even ones that draw nothing. The RNG state therefore moves on every revision, and an old snapshot predicts nothing.
  - No handler can forget it.
- **Why not before `CreateGame`:** there is no RNG yet. Keeping `CreateGame` seed-only also keeps the existing "same seed → same RNG" lifecycle scenario true, and leaves the seed as the reproducible input for future board generation (the board is public anyway).
- **Why chained splitmix and not a plain XOR:**
  - XOR alone gives no diffusion between words.
  - The forward chain alone leaves word i independent of inputs after i (found during apply: flipping `e[3]` changed only word 3). The backward pass makes every output word depend on every input word.
  - It uses only `Math.imul`/`>>>`, like the rest of `rng.ts`, so the output is bit-identical everywhere.
- *Alternatives:*
  - **Dice values supplied by the host** were rejected during exploration: the host would have to know how many draws, and of what kind, each command needs.
  - **Re-seeding from entropy alone** was rejected: it discards the seed contribution, so a host bug that supplies constant entropy would make every game identical.

### D3: The rules version becomes `core-1`

The RNG stream for a given seed and command sequence changes, so `SUPPORTED_RULES_VERSIONS = ['core-1']` and `core-0` is dropped. Old logs fail at index 0 with `UNSUPPORTED_RULES_VERSION` through the existing replay path. Test fixtures that hard-code `'core-0'` move to `'core-1'`.

### D4: The envelope carries `expected`, and each command spec declares its `guard`

```ts
type TargetRef = { readonly kind: string; readonly id: string };
type Expectation =
  | { readonly kind: 'revision'; readonly revision: Revision }
  | { readonly kind: 'target'; readonly target: TargetRef };

type ConcurrencyGuard =
  | { readonly kind: 'revision' }
  | { readonly kind: 'target'; readonly targetKind: string;
      currentTarget(state: GameState): string | null };

interface CommandSpec { readonly guard: ConcurrencyGuard; /* ...existing fields */ }
```

- **`guard` is required**, so adding a command type without choosing a guard does not compile. The helpers are `revisionGuard` (a constant) and `targetGuard(kind, fn)`.
- **Step 2 of the check order becomes `checkExpectation(spec.guard, command.expected, state)`.**
  - It compares structurally and never throws, even on a malformed `expected` arriving from JSON.
  - Revision guard: anything other than `{kind:'revision', revision === state.revision}` → `REVISION_MISMATCH`.
  - Target guard: anything other than `{kind:'target', target.kind === targetKind, target.id === currentTarget(state)}` (with a non-null current target) → `TARGET_MISMATCH`.
- **Constraint for future target kinds:**
  - A target id must never be reused within one game (for example, turn ids are monotonic). Otherwise a stale command could match a new object that happens to have the same id.
  - This lives in design rather than the spec, because no target kind exists yet. The first change that defines one must add it as a spec requirement.
- *Alternatives:*
  - **An optional `target` next to `expectedRevision`:** it is ambiguous which one wins, and it is easy to pass both.
  - **Per-object revision counters in the state:** more state for the same guarantee, given unique ids.
  - **No revision check for player commands at all:** loses protection for commands that really do depend on the exact state they saw.

### D5: The session fingerprint uses `expected`, and the log stores `entropy`

- `fingerprint = canonicalJson({ type, actor, expected, payload })`. The context is deliberately excluded. A retransmitted command reaches the Room with fresh entropy and must still count as a duplicate.
- `LogEntry` gains `entropy: Entropy`, and `replay` submits `{ now: entry.now, entropy: entry.entropy }`.
- The `snapshot` helper already deep-copies and freezes. The entropy tuple is copied the same way, so a caller mutating its array cannot corrupt the log.

### D6: Projection is classified by a type-checked map in a new `projection.ts`

```ts
type Visibility = 'public' | 'secret';
const STATE_VISIBILITY = {
  revision: 'public', rulesVersion: 'public', phase: 'public', players: 'public', rng: 'secret',
} as const satisfies Record<keyof GameState, Visibility>;

type StateView = { readonly [K in keyof GameState as (typeof STATE_VISIBILITY)[K] extends 'public' ? K : never]: GameState[K] };
type Viewer = { readonly kind: 'player'; readonly id: PlayerId } | { readonly kind: 'spectator' };

projectState(state, viewer): StateView     // copies public keys only, via the map
projectEvents(events, viewer): GameEvent[] // per-type classification; unknown type -> throws UnclassifiedEventError
```

- **Why the map must be complete:** `satisfies Record<keyof GameState, Visibility>` fails to compile when `GameState` gains a key the map lacks. That is the "every field is classified" requirement.
- **Why the projection is built from the map:**
  - `projectState` iterates the map's public keys rather than spreading the state and deleting secrets.
  - A new field therefore cannot leak, even if someone marks it public by mistake, without a deliberate edit.
- **Event classification** is `EVENT_VISIBILITY: Record<LifecycleEvent['type'], 'public'>` for now. Later changes add entries, or per-viewer redaction functions, next to their events. An unknown type throws, because a silently forwarded event is exactly the leak this guards against.
- **Normalizing the viewer:** a player viewer that is not a member is treated as a spectator, so the Room cannot accidentally give a non-member a player-specific view later.
- *Alternatives:*
  - **A `visibility` field on every event:** handlers could forget it, and it bloats the log.
  - **Projecting in the Room:** puts knowledge of the rules outside the core, and every host would have to repeat it.

### D7: Test fixtures absorb the API change in one place

`__tests__/helpers/fixtures.ts`:

- `ctx(ms?, ent?)` returns a fixed default entropy.
- `cmd(type, payload, { rev | target })` builds `expected`.
- `lobbyState` uses `'core-1'`.

Most test files only touch these helpers, so they need few changes.

## Risks / Trade-offs

- **[A hand-written mixing function with weak diffusion]** → Golden vector for `absorbEntropy`. A test that flipping any single entropy bit changes every output word, checked over a sample of bits. Any later fix to the function bumps the rules version.
- **[The host supplies constant or low-quality entropy]** → Not detectable inside the core. The seed contribution is kept (D2), so the result is still a seeded stream rather than a fixed one. The Room's use of a CSPRNG is a documented host obligation.
- **[Target ids reused by a future target kind]** → The D4 constraint. The first change that defines a target kind must add a spec requirement and an invariant.
- **[The fail-closed event projection throws in production for a newly added event]** → It is intended to surface during development. A test projects every event type that the lifecycle registry can produce.
- **[A larger breaking API surface: context, envelope, log]** → The only consumers are in-repo tests and the server's type re-export. No persisted logs exist yet.

## Migration Plan

- There is no persisted data. `core-0` logs, if any exist in tests, are rejected by the rules-version gate. That is the intended behavior.
- Rollback means reverting the change. There is no dual-version support.
