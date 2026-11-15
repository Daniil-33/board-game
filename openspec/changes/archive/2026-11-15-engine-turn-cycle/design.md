# Design

## Context

`packages/game-core` has the envelope (`registry.ts`: type → guard → actor → membership → phase → handler, entropy absorbed before the handler), lifecycle commands ending in phase `setup`, a session with log and full `replay`, and per-viewer projection that copies only classified-public keys. Handlers are pure, return new state and events, and never touch `revision`. Behavior is in the delta specs; the interpretations needing Team Lead approval are listed in `proposal.md`.

## Goals / Non-Goals

**Goals:** stage 1 rules as pure handlers on the existing registry; a host contract small enough that the server never re-implements rules (`pendingDeadlines`, `restoreSession`); every rule provable by seeded deterministic tests.

**Non-Goals:** a general phase/step machine for later stages (auctions, offers); performance work; changing the envelope check order.

## Decisions

### D1. Module split

- `board.ts`: `PLACEHOLDER_RING` (`{ placeholder: true, size: 40, startCell: 0, jailCell: 10, cells }`, each cell `{ index, kind: 'start' | 'jail' | 'blank' }`), with a `PLACEHOLDER` comment that stage 2 replaces it with `CLASSIC_40`. Jail on cell 10 mirrors the classic layout so stage 2 changes the least.
- `setup.ts`: `RollForOrder` handler and the setup-side `Timeout` branch.
- `turns.ts`: `RollDice`, `EndTurn`, the turn-side `Timeout` branch, `closeTurn`, `startTurn`, the no-op `settleMandatory` hook.
- `interim-jail.ts`: `INTERIM_JAIL_RULE` constant (`{ temporary: true, replacedInStage: 6, maxAttempts: 3 }`) and `resolveJailAttempt(...)`, isolated so stage 6 deletes one file.
- `deadlines.ts`: duration constants, `PendingDeadline`, `pendingDeadlines(state)`.
- `lifecycle.ts` keeps `CreateGame/AddPlayer/StartGame`; `gameEngine` is built from the merged registry in a new `rules.ts` (avoids an import cycle between lifecycle and setup). `index.ts` keeps re-exporting `gameEngine`.

Alternative: one large `rules.ts`. Rejected: the interim jail must be removable in isolation.

### D2. State shape (all keys public)

```ts
type Phase = 'uninitialized' | 'lobby' | 'setup' | 'playing';
interface SetupState {
  setupRollId: string; playerId: PlayerId; deadline: Timestamp;
  groups: readonly (readonly PlayerId[])[];   // ordered; size 1 = resolved
  round: { groupIndex: number; pending: readonly PlayerId[]; rolls: Readonly<Record<string, number>> };
}
interface TurnState {
  turnId: string; playerId: PlayerId; deadline: Timestamp; bonus: boolean;
  rolled: boolean; continuation: boolean; doublesStreak: number; pendingBonus: boolean;
  quotas: { builds: number; offers: number };  // remaining
}
GameState += { setup: SetupState | null; order: readonly PlayerId[] | null; turn: TurnState | null;
               positions: Readonly<Record<string, number>>; jail: Readonly<Record<string, { attemptsUsed: number }>> }
```

`pending[0]` is always `setup.playerId`. Records keyed by player id are plain JSON, so canonical JSON, snapshots and projection need no changes. `genesis()` gets `null/{}` values.

Setup algorithm: `groups` starts as `[allPlayersInJoinOrder]`. A round rolls the first group of size > 1, members in their stored order. When `pending` empties, that group is replaced by its members bucketed by value, descending, each bucket in stored order (stable); a bucket of size > 1 emits `OrderTied`. The next round picks the first group of size > 1 again; none left → `order = groups.flat()`, phase `playing`.

### D3. Target ids

`setupRollId = "s" + (state.revision + 1)`, `turnId = "t" + (state.revision + 1)`: the revision the accepting command produces. One command creates at most one target of each kind and revisions never repeat, so ids are never reused, with no extra counter in state. Handlers only read `revision`.

### D4. Multi-kind target guard

`ConcurrencyGuard` gains a variant `{ kind: 'targets'; targetKinds: readonly string[]; currentTargets(state): readonly TargetRef[] }`, built by `targetsGuard(kinds, fn)`; `checkExpectation` passes when the expected target's kind and id equal one entry. `Timeout` uses `targetsGuard(['turn', 'setupRoll'], s => pendingDeadlines(s).map(d => d.target))`, so the guard and the host contract cannot drift. The existing single-kind `targetGuard` stays (used by `RollForOrder`, `RollDice`, `EndTurn`). Error code stays `TARGET_MISMATCH`.

Alternatives: two command types `TurnTimeout`/`SetupTimeout` (rejected: design names one `Timeout`, and protocol would grow per future deadline kind); a fixed pseudo-kind `deadline` (rejected: the server would need to translate targets).

### D5. Handler check order

After the envelope: payload must be `null` (`INVALID_PAYLOAD`) → actor owns the target (`NOT_ACTIVE_PLAYER`) → deadline (`DEADLINE_PASSED` / `DEADLINE_NOT_REACHED`) → state precondition (`ALREADY_ROLLED`, `ROLL_REQUIRED`). Ownership before deadline so a non-owner never learns timing-dependent errors; deadline before preconditions so a late command always reads as late.

### D6. Roll pipeline

`applyRoll(state, dice, auto)` is shared by `RollDice` and `Timeout`:
1. emit `DiceRolled`;
2. if in jail → `resolveJailAttempt` (streak := 0, no pendingBonus);
3. else if double and `doublesStreak + 1 === 3` → jail send: position := jailCell, `jail[p] = { attemptsUsed: 0 }`, streak 0, pendingBonus false, `SentToJail`, then `closeTurn(reason 'sent-to-jail')` (settlement hook runs here too, a no-op);
4. else move; streak := double ? streak + 1 : 0; pendingBonus := double.

Then `rolled := true`. For `Timeout`, if the turn is still open after step 3/4, deadline := now + 20 000, `continuation := true`, `TurnContinued`.

`closeTurn`: `settleMandatory` (identity) → `TurnEnded{reason}` → if `pendingBonus` start a bonus turn for the same player carrying `doublesStreak`; else next in `order`, streak 0. New turn: fresh quotas `TURN_QUOTAS`, deadline now + 45 000.

Dice: two `nextIntInclusive(rng, 1, 6)` draws, first die first. Setup: one draw.

### D7. `restoreSession`

`createSession(engine, initial = genesis())` gains an optional initial state (internal; exported signature stays compatible). `restoreSession(engine, snapshot, tail)` runs `checkInvariants(snapshot)`, then submits each entry, throwing `ReplayDivergenceError` when `entry.revision !== previous + 1` (checked before execution), the result is rejected, or revision/events differ — the same comparisons as `replay`, factored into one helper. `replay(engine, log)` becomes `restoreSession(engine, genesis(), log)`. The snapshot is deep-copied and frozen so caller mutation cannot corrupt the session.

The dedupe index covers only tail entries; ids logged before the snapshot are the host's job (unique `(game_id, command_id)`), as stated in proposal Out of Scope.

### D8. Invariants

Add `phase-state-shape` (setup non-null iff `setup`; order, turn non-null and a position for every player iff `playing`; `order` is a permutation of players; turn owner is in `order`; jail keys are players) and `ring-position` (integer in `[0, 40)`). They catch handler defects in the property test.

### D9. Event payloads

| Event | Payload |
|---|---|
| `OrderRollStarted` | `{ setupRollId, playerId, deadline }` |
| `OrderDieRolled` | `{ playerId, value, auto }` |
| `OrderTied` | `{ playerIds, value }` |
| `TurnOrderDetermined` | `{ order }` |
| `TurnStarted` | `{ turnId, playerId, deadline, bonus }` |
| `DiceRolled` | `{ turnId, playerId, dice: [d1, d2], double, auto }` |
| `PlayerMoved` | `{ playerId, from, to, steps }` |
| `TurnContinued` | `{ turnId, deadline }` |
| `TurnEnded` | `{ turnId, playerId, reason: 'end-turn' \| 'timeout' \| 'sent-to-jail' }` |
| `SentToJail` | `{ playerId, from, to }` |
| `InterimJailAttemptFailed` | `{ playerId, attemptsUsed }` |
| `InterimJailReleased` | `{ playerId, reason: 'double' \| 'attempts-exhausted' }` |

`InterimJail*` names carry the temporary marker into protocol.

### D10. Tests

Scenario tests drive a real session from `CreateGame`. To force dice, a test helper searches entropy (deterministic loop over a counter mixed into fixed words) until the next draw yields the wanted dice; this exercises the real RNG path instead of stubbing it. Boundary tests at `deadline - 1 / deadline / deadline + 1` for `RollForOrder`, `RollDice`, `EndTurn` and both `Timeout` kinds. The property test generates random interleavings of all seven commands with random times around deadlines, correct/stale/malformed targets, wrong actors, duplicates and conflicts, then checks live state == re-submitted state == `replay(log)` == `restoreSession(snapshot at random k, log.slice(k))`. A seeded multi-turn test pins a golden summary (order, positions, turn count) of a 300-command game.

## Risks / Trade-offs

- [Interpretations 1-6 in the proposal could be overruled] → each is confined to one function (`setup.ts` round logic, `closeTurn`, `applyRoll`) and has a named test; the proposal checkpoint asks before Apply.
- [Entropy-search helper could loop long] → bounded search with a clear failure; expected ≤ 36 tries per pair of dice.
- [Revision-derived ids leak revision numbers to clients] → revisions are already public.
- [Sequential setup with six AFK players takes up to 4.5 min] → accepted product cost of the per-roll 45 s deadline; noted for the Team Lead.
- [Stage 2 will add landing effects inside `applyRoll`] → the move step and settlement hook are the documented extension points.

## Migration Plan

`core-1` is dropped from `SUPPORTED_RULES_VERSIONS`; no persisted games exist, so nothing migrates. Rollback is reverting the PR.
