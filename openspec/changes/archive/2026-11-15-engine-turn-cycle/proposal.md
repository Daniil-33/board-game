# Proposal

## Why

Stage 1 of `ROADMAP.md` ("Сквозной скелет") needs a game that actually runs: after `StartGame` the core today sits in `setup` and accepts nothing. The server task needs real rules to drive, plus two host contracts it cannot build without: the list of deadlines a `Timeout` may resolve (to arm timers, including after a restart) and a way to rebuild a session from a snapshot plus a log tail.

This change implements the stage 1 core rules from `GAME-BREAKDOWN.md` § "Порядок ходов, ход и кости" and the owner decisions in `ROADMAP.md` stage 1 "Решения владельца (приняты 2026-11-14)", as assigned by `TASK-s1-core-turns` (handoff revision 1) and `docs/efforts/stage-1-skeleton/design.md` § "Core additions".

## What Changes

- **Setup order rolls.** `StartGame` opens the order-roll phase. Participants roll one die each, one at a time, each roll with a 45 s deadline. Order is descending; only tied participants reroll, starting from the first unresolved group. A `Timeout` at or after the deadline rolls for the participant. When every group is resolved the game enters the new phase `playing` and the first turn starts.
- **Turns.** A turn has a never-reused `turnId`, a 45 s deadline and a 2d6 roll. Player commands (`RollDice`, `EndTurn`) are accepted strictly before the deadline; `Timeout` only at or after it. Timeout before a roll: the system rolls and the same turn continues for 20 s with quotas unchanged. Timeout after a roll: the mandatory-settlement hook (a no-op in stage 1) runs and the turn closes. `EndTurn` closes the turn after a roll.
- **Doubles.** A double marks a pending bonus turn; when the current turn closes (by `EndTurn` or `Timeout`) the same player starts a new turn with fresh time and quotas. A third consecutive double sends the player to jail before movement, resets the streak and ends the turn at once.
- **Prior jail rule** (the three-attempt jail rule, temporary, replaced in stage 6). A prisoner's `RollDice` is a release attempt: a double releases and moves by its sum without a bonus turn; after the third failed attempt the player leaves and moves by that roll's sum.
- **Movement** by the 2d6 sum on a 40-cell ring exported as `PLACEHOLDER_RING`, explicitly marked as a placeholder replaced in stage 2, with one placeholder jail cell.
- **Turn quotas** (one build, two trade offers) as remaining-count fields, reset on every new turn and not on continuation. Nothing consumes them yet.
- **Host contracts.** `pendingDeadlines(state)` lists every `{ target, at }` that a `Timeout` may resolve. `restoreSession(engine, snapshotState, tail)` rebuilds a session from a snapshot and the log entries after it, throwing `ReplayDivergenceError` on mismatch.
- **`Timeout` guard.** One `Timeout` command type resolves either a `turn` or a `setupRoll` target. The target guard is generalized so one command type may accept a target equal to any one of the state's current targets.
- **BREAKING** `rulesVersion` becomes `core-2`; `core-1` is no longer supported. No persisted games exist.
- **BREAKING** `StartGame` now emits `GameStarted` followed by `OrderRollStarted`, and phase `setup` accepts `RollForOrder` and `Timeout`.
- All new state keys and event types are public.

### Names published for `TASK-s1-protocol`

- Commands: `RollForOrder` (player, target `setupRoll`, payload `null`), `RollDice` (player, target `turn`, payload `null`), `EndTurn` (player, target `turn`, payload `null`), `Timeout` (system, target `turn` or `setupRoll` named in `expected`, payload `null`).
- Events: `OrderRollStarted`, `OrderDieRolled`, `OrderTied`, `TurnOrderDetermined`, `TurnStarted`, `DiceRolled`, `PlayerMoved`, `TurnContinued`, `TurnEnded`, `SentToJail`, `InterimJailAttemptFailed`, `InterimJailReleased`.
- State keys: `phase` (`uninitialized | lobby | setup | playing`), `setup`, `order`, `turn`, `positions`, `jail`.
- Error codes: `NOT_ACTIVE_PLAYER`, `DEADLINE_PASSED`, `DEADLINE_NOT_REACHED`, `ALREADY_ROLLED`, `ROLL_REQUIRED`, plus existing `INVALID_PAYLOAD`, `TARGET_MISMATCH`.
- Exports: `pendingDeadlines`, `PendingDeadline`, `restoreSession`, `PLACEHOLDER_RING`, the three-attempt jail rule, `TURN_DURATION_MS`, `CONTINUATION_MS`, `SETUP_ROLL_DURATION_MS`, `TURN_QUOTAS`.

Exact payload shapes are in `design.md` § D9.

### Interpretations submitted for Team Lead approval

These follow from the sources but are not stated word for word; each is applied in the specs.

1. **Setup rolls are sequential.** One participant rolls at a time (join order; tied participants keep their relative join order), each with its own 45 s deadline and its own `setupRoll` target. Basis: the design's single "current `setupRollId`" and "Timeout … rolls for the participant". Alternative: simultaneous rolls per round with a shared deadline, which would need several current targets of one kind.
2. **Every bonus turn begins when the current turn closes,** for manual and automatic doubles alike. After a manual double the player stays in the rolled turn (where stage 2+ landing actions happen) until `EndTurn` or `Timeout`. Basis: GAME-BREAKDOWN "каждый бросок относится к отдельному ходу" and the design field `pendingBonus`.
3. **Prisoner and doubles streak.** Sending to jail resets the streak; a jail attempt never counts toward the streak and never grants a bonus turn, so a prisoner cannot reach a third double (the handoff's example edge case does not arise).
4. **Timeout before a roll in jail** auto-rolls the jail attempt and grants the 20 s continuation, exactly like a normal turn. A third double from an automatic roll sends to jail and ends the turn with no continuation.
5. **New deadlines are measured from the accepting command's `now`** (for example a turn opened by a late `Timeout` at `now` gets `now + 45 s`), not from the previous deadline.
6. **`Timeout` names its target in `expected`, payload `null`,** instead of a payload field (the design says "payload names which"); the expectation already carries the target kind.
7. **Accepted spec changes** (handoff escalation condition): `engine/command-execution` "Target guard" is generalized to a set of current targets; `engine/game-lifecycle` "Game phases" and "Start game", `engine/projection` field lists and `engine/command-execution` "Invariant enforcement" are modified; `engine/session` gains a restore requirement.

## Capabilities

### New Capabilities

- `engine/turn-order`: the setup phase that rolls for and fixes the turn order.
- `engine/turn-cycle`: turns, 2d6 rolls, movement on the placeholder ring, doubles and bonus turns, third double to jail, turn quotas.
- `engine/special-cells`: the temporary stage 1 jail stay and release rule.
- `engine/deadlines`: the strict-before / at-or-after deadline rule, `Timeout` binding, and the pending-deadline listing for hosts.

### Modified Capabilities

- `engine/command-execution`: "Target guard" accepts any one of several current targets; "Invariant enforcement" adds phase-shape and ring-position invariants.
- `engine/game-lifecycle`: "Game phases" adds `playing` and the commands accepted in `setup`; "Start game" opens the first order roll; "Rules version gate" names `core-2`.
- `engine/projection`: "State projection hides secrets" and "Event projection fails closed" cover the new public fields and events.
- `engine/session`: adds "Restore from snapshot and tail".

## Impact

- `packages/game-core/src`: `state.ts`, `registry.ts`, `lifecycle.ts`, `invariants.ts`, `projection.ts`, `session.ts`, `index.ts` change; new modules for the board placeholder, setup, turns, prior jail and deadlines.
- Tests that pin `core-1`, the `StartGame` event list, or "nothing accepted in setup" are updated; the replay property test grows to cover turn commands.
- `packages/protocol` (parallel task) imports the published type names. `apps/server` and `apps/client` are not touched.
- No new dependencies.

## Out of Scope

- Money, the lap reward, the real `CLASSIC_40` layout and cell effects (`GAME-BREAKDOWN.md` § "Движение, круг и награда", § "Участники и поле"; stage 2).
- Final jail rules, fees and voluntary exit (§ "Особые клетки и события"; stage 6).
- Any settlement logic beyond a no-op hook; consuming build or offer quotas (§ "Активы, рента и строительство", § "Обмены/предложения").
- Lobby leave/kick, player removal, game end.
- Server, protocol and client code.
- Deduplicating command ids that were logged before the snapshot a session is restored from; the host's `(game_id, command_id)` index covers that.
