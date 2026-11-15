# Team Lead -> Engineer Task Handoff

```yaml
id: TASK-s1-core-resign
revision: 1
effort: EFF-stage-1-skeleton
project: economic-board-game
source_commit: e30d40a # main with handoff revision 3
owner: team-lead
status: proposed
```

## Outcome

`packages/game-core` supports leaving a lobby, resigning during a game, and
game end with a winner (effort handoff revision 3, criteria 1b and 1c).

## Acceptance criteria

Product:

1. `LeaveLobby` (system actor, phase `lobby`): removes a participant from the
   game before start. The server decides who may leave and closes the room
   when the creator leaves; the core only removes the player.
2. `Resign` (player actor, phases `setup` and `playing`, valid at any time,
   not only on the player's own turn, not bound to a deadline): the player is
   permanently eliminated and removed from the turn order.
   - In `playing`, if it is the resigning player's turn, that turn closes
     (no bonus turn, no settlement beyond the stage 1 no-op) and the next
     active player's turn starts.
   - In `setup`, the player leaves the order-roll groups; if they were the
     current roller, the next roller starts with a fresh deadline.
   - A prisoner may resign; their jail state is removed.
3. When exactly one active player remains (after a resignation in `setup` or
   `playing`), the game ends: phase `finished`, `winner` set, no pending
   deadlines, every further player command is rejected.
4. A dropped connection is not modelled in the core (reconnect and timeouts
   already apply).

Technical proof:

5. New events (for example `PlayerLeftLobby`, `PlayerResigned`, `GameEnded`)
   with object payloads; new state keys classified in `STATE_VISIBILITY`, all
   public.
6. Invariants updated: eliminated players have no position or turn; in
   `finished` there is no turn and no setup.
7. `pendingDeadlines` returns nothing in `finished`; stale timeouts after a
   resignation are rejected by the target guard.
8. `rulesVersion` bump (for example `core-3`).
9. Deterministic tests for every case above, including resignation of the
   current roller in setup, resignation on own turn, on someone else's turn,
   while in jail, down to one player in setup and in play; property and replay
   tests extended to the new commands; `restoreSession` across a resignation.

## Scope and non-goals

In scope: `packages/game-core/**`, an OpenSpec change.

Not in scope: access codes and room listing (server/protocol), any server or
client code, economy effects of resignation (stage 5), the open question of a
player who never reconnects (stage 8).

## Canonical references

- `docs/efforts/stage-1-skeleton.md` revision 3, criteria 1a-1c.
- `ROADMAP.md` stage 1 "Решения владельца", decisions on leaving and resignation.
- `openspec/specs/engine/*`, `openspec/changes/engine-turn-cycle`.
- `docs/efforts/stage-1-skeleton/design.md` § "Core additions".

## Constraints and invariants

Headless deterministic core; rejected commands never mutate state or consume
randomness; one revision per accepted command; target ids never reused;
player-keyed records must be own-key safe (see core review RVW-002).

## Dependencies

Starts after PR #13 merges. Runs in parallel with the protocol lobby task.
The server tasks consume the new commands.

## Delegated decisions

Command and event names and payloads, state shape for eliminated players and
the winner, module layout. Publish names in the proposal. Return to the Team
Lead for any product case not listed (for example simultaneous resignations
are impossible because commands are serial; anything else unclear escalates).

## Required workflow

Explore -> Propose (OpenSpec change, report with `--wake`) -> Team Lead
approval -> Apply in a fresh context -> Verify -> PR -> Review fixes.

## Required checks

`pnpm build`, `pnpm test`, new and extended replay/property tests, OpenSpec
validate `--strict`, `git diff --check` over the range, green CI on the PR head.

## Escalation conditions

A case the owner decisions do not cover that changes observable behavior;
conflict with an accepted engine spec.

## Deliverables

Code, tests, OpenSpec change, branch `agent/task-s1-core-resign`, PR, CI
evidence, independent review report, residual risks.

The Engineer accepts the exact revision before editing. A material change
creates a new revision.
