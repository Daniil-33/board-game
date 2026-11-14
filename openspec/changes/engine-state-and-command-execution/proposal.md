# Proposal

## Why

`packages/game-core` currently exposes only contracts: there is no concrete game state, no way to dispatch a command to a handler, and nothing that holds the current state, records accepted commands, or replays them. GAME-BREAKDOWN.md §"Принятый продуктовый контур и последовательность" puts the deterministic headless state machine (state, commands, events, replay, invariant checks) first, before any gameplay — every later change (setup rolls, movement, economy) needs this machinery to plug into.

## What Changes

- Add a concrete, versioned `GameState` skeleton: `revision`, `rulesVersion`, `phase`, `players`, and the RNG state.
- Add a pure command-execution engine: a command registry (per type: allowed actor kinds, allowed phases, handler), a fixed envelope-check order, and post-transition invariant checks.
- Add three lifecycle commands only: `CreateGame` (seed + rules version), `AddPlayer`, `StartGame`. `StartGame` moves the game into the `setup` phase, which accepts no commands yet.
- Add a deterministic in-memory session: holds the current state and an ordered log of accepted commands, deduplicates by `commandId`, and rebuilds identical state and events by replaying the log.
- Add a pure seeded RNG whose state lives inside `GameState`, so a rejected command cannot consume randomness.
- **BREAKING** `TransitionContext` no longer carries `rng`; randomness comes only from state seeded by `CreateGame`.
- **BREAKING** The command envelope replaces `actorId: PlayerId` with `actor: { kind: 'player', id } | { kind: 'system' }`.
- **BREAKING** `Timestamp` becomes a branded integer (epoch milliseconds) instead of a branded string.

## Capabilities

### New Capabilities

- `engine/command-execution`: How a single command is validated and applied to the game state — registry dispatch, envelope-check order, actor and phase permissions, error codes, invariant enforcement.
- `engine/game-lifecycle`: The game state skeleton and the lifecycle commands that create a game, add players, and start it.
- `engine/session`: Holding the current state across commands — the accepted-command log, `commandId` deduplication, and deterministic replay.

### Modified Capabilities

- `engine/contracts`:
  - "Deterministic transition context" changes: randomness moves from the context into seeded state.
  - "Command idempotency envelope" changes: the actor becomes player-or-system.
  - A requirement is added for the `Timestamp` representation.

## Impact

- `packages/game-core/src`: `context.ts`, `engine.ts`, `types.ts` change; new modules for state, RNG, registry/engine, lifecycle commands, and session.
- Existing tests that build a `TransitionContext` with `rng` or a command with `actorId` must be updated (`contracts.fixture.test.ts`); the boundary test must cover the new source files.
- `apps/server` only re-exports a type, so it should still compile without changes. `apps/client` is unaffected.
- No new runtime dependencies.

## Out of Scope

- Setup turn-order rolls, `RollDice`, movement, `EndTurn`, turn deadlines and `Timeout` commands (GAME-BREAKDOWN.md §"Порядок ходов, ход и кости").
- Board/`CLASSIC_40` configuration, starting cash and credit limits (§"Участники и поле", §"Начальная настройка и деньги"). Players carry no money in this change.
- Any economic mechanics: purchase, rent, auction, trade, mortgage, bankruptcy.
- The open phase-graph questions (jailed next player, doubles chains); these are still open in §"Порядок ходов, ход и кости" and are not decided here.
- Players joining by themselves. `AddPlayer` and `StartGame` are system-only, because self-join belongs to the deferred multiplayer/lobby phase (§"Не входит в ранний MVP / отложено").
- Persistence, snapshots on disk, networking, real timers. The session is in-memory and has no I/O.
- Migration of logs between rules versions. A log whose rules version is unsupported is rejected, never read silently (§"Принятые технические границы и текущая реализация").
