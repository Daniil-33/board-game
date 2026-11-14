# Proposal

## Why

The game will be played as a multiplayer room: every player is a separate client, and an authoritative server (the "Room") hosts the pure `game-core` session. The networked multiplayer itself is a later phase (GAME-BREAKDOWN.md §"Принятый продуктовый контур и последовательность", item 4). Even so, three parts of the current engine contract would have to be reworked once it arrives, and each later gameplay change would build more code on top of them:

- **All future dice are derived from one seed.** RNG state lives in `GameState`, and it depends only on the `CreateGame` seed. Anyone who learns the seed or one state snapshot can predict every future roll. A leaked log, a debug dump or a projection bug is enough.
- **Every command must match the global revision exactly.** Each command needs an exact `expectedRevision`. With several clients acting at the same time (auction bids, trade responses), a correct command gets rejected just because another player's command landed first. GAME-BREAKDOWN.md §"Обязательные качества/приёмка" already lists "target turn" next to the expected revision as part of command identity.
- **Clients have no safe view of the state.** Nothing defines what a client may see. As soon as the state holds a secret (the RNG today; chance decks and private offers later), sending `GameState` to a client leaks it.

The next planned change, setup turn-order rolls and the turn cycle, is the first to draw dice and to deal with players acting against a deadline. These contracts should be settled before it lands.

## What Changes

- **BREAKING** `TransitionContext` gains a required `entropy` field: 128 bits supplied by the host for every command. When a command is accepted, the engine mixes the entropy into the state's RNG before the handler runs. The resulting stream depends on the seed and on all entropy received so far. The seed alone, or any past state, does not predict future draws. A rejected command still leaves the RNG state untouched. This follows GAME-BREAKDOWN.md §"Порядок ходов, ход и кости": randomness reaches the core from a trusted adapter, and the core never takes it from a hidden source.
- **BREAKING** The session log records each entry's `entropy` next to its `now`, and replay feeds both back in.
- **BREAKING** The rules version becomes `core-1`, because the RNG stream changes. `core-0` logs are rejected under the existing rules-version gate.
- **BREAKING** The command envelope replaces `expectedRevision: Revision` with `expected`. It holds either a revision expectation (exact match, as today) or a target expectation, which names a game object such as a turn or an auction. Each command type declares which kind it uses. A target-guarded command is accepted while its target is still current, whatever the global revision. Its handler then re-validates it against the current state. The session fingerprint uses `expected` instead of `expectedRevision`.
- Add per-viewer projection: `projectState(state, viewer)` and `projectEvents(events, viewer)`. Every `GameState` field and every event type must be classified for visibility; an unclassified one does not compile or fails closed. The RNG state is never visible to any viewer.
- All existing lifecycle commands (`CreateGame`, `AddPlayer`, `StartGame`) keep revision-guarded behavior, and all lifecycle events are public.

## Capabilities

### New Capabilities

- `engine/projection`: What each viewer (a player or a spectator) may see of the game state and events, the rule that every state field and event type is classified, and fail-closed handling of unclassified data.

### Modified Capabilities

- `engine/contracts`:
  - "Deterministic transition context" changes: the context carries host-supplied entropy, and the engine mixes it into the state RNG on acceptance.
  - "Command idempotency envelope" changes: `expectedRevision` is replaced by a revision-or-target `expected`.
- `engine/command-execution`:
  - "Envelope check order" changes: step 2 becomes an expectation check that depends on the command type's guard kind.
  - A requirement is added for command-type concurrency guards (`TARGET_MISMATCH`).
  - A requirement is added for entropy mixing as part of accepted-transition bookkeeping.
- `engine/session`:
  - "Accepted-command log" records entropy.
  - "Deterministic replay" replays with each entry's time and entropy.
  - "Repeated command returns the original result" fingerprints `expected` instead of `expectedRevision`.

## Impact

- `packages/game-core/src`:
  - `context.ts`, `types.ts` (new `Entropy` brand), `rng.ts` (entropy absorption), `engine.ts` (envelope), `registry.ts` (guard check, mixing), `session.ts` (log, fingerprint, replay) and `lifecycle.ts` (rules version, guard declarations) change.
  - New module `projection.ts`.
  - `index.ts` exports change.
- Tests that build a context, a command envelope or a log entry are updated; there are about 10 test files using `expectedRevision` or the `ctx` helper. The golden RNG vector for the raw seed stream remains valid, and a new golden vector covers entropy absorption.
- `apps/server` re-exports only a type, so it keeps compiling. `apps/client` is unaffected.
- No new runtime dependencies. The core still never calls a global random source. Generating entropy (for example with a CSPRNG) is the host's job.

## Out of Scope

- The Room server itself: transport (WebSocket), authentication, lobbies, self-join, reconnect, persistence, real timers and the CSPRNG call (GAME-BREAKDOWN.md §"Не входит в ранний MVP / отложено"). This change only shapes the core contracts the Room will use.
- Any real target-guarded command. Turns, auctions and trade offers do not exist yet. The guard mechanism is specified and tested with fixture commands, and the first real user is the turn-cycle change.
- Setup turn-order rolls, `RollDice`, deadlines and `Timeout`, and their open questions: deadline in setup, jail exit, the forced-roll doubles chain (§"Порядок ходов, ход и кости"). They belong to the next change.
- Viewer-specific hidden information other than the RNG. Every current state field other than `rng` and every current event is public. Private data (chance deck order, private trade offers) gets classified when it is introduced.
- Projection for the host or Room. The Room uses the raw state; projection exists only for clients.
- Commit-reveal or other "provably fair" schemes for entropy. Trust in the host's entropy is assumed, as the authoritative-server model in §"Принятые технические границы и текущая реализация" already requires.
- Migrating `core-0` logs. They are rejected, never reinterpreted.
