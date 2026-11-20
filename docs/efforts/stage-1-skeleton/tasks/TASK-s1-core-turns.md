# Team Lead -> Engineer Task Handoff

```yaml
id: TASK-s1-core-turns
revision: 1
effort: EFF-stage-1-skeleton
project: economic-board-game
source_commit: a68ed55 # handoff revision 2; rebase on main after TASK-s1-ci merges
owner: team-lead
status: proposed
```

## Outcome

`packages/game-core` runs stage 1 rules from game start to an endless sequence
of turns: setup order rolls, turns with deadlines, 2d6 movement on a
placeholder 40-cell ring, doubles and bonus turns, third double to jail, and
the prior jail rule. It exposes the deadline and recovery contracts the
server needs.

## Acceptance criteria

Product (handoff criteria 2-7, 13; owner decisions in `ROADMAP.md` stage 1):

1. Setup: every participant rolls one die; order descending; only tied
   participants reroll, starting from the first unresolved group. 45 s deadline
   per setup roll; `Timeout` at or after it rolls for the participant.
2. Turn: 45 s, 2d6. Player commands only strictly before the deadline;
   `Timeout` only at or after it, bound to `turnId` (target guard). Timeout
   before a roll: system rolls and grants 20 s continuation of the same turn,
   quotas unchanged. Timeout after a roll: mandatory settlement (none exists in
   stage 1) and the turn closes. `EndTurn` closes the turn after a roll.
3. Doubles: a double grants a bonus turn with fresh time and quotas; a double
   from an automatic roll grants it after the current turn closes. A third
   consecutive double sends the player to jail before movement, resets the
   streak and ends the turn.
4. Prior jail rule, named the three-attempt jail rule and marked temporary: on each
   of up to three own turns the prisoner rolls; a double releases and moves by
   that sum **without a bonus turn** (owner decision, handoff revision 2); after
   the third failed roll the player leaves and moves by that roll's sum.
5. Movement by the 2d6 sum around a ring of 40 cells; the layout constant is
   exported with an explicit placeholder marker and comment that stage 2
   replaces it; it includes one placeholder jail cell.
6. Quotas (one build, two trade offers) exist as counters reset on each new
   turn (not on continuation).

Technical proof:

7. `pendingDeadlines(state): readonly { target: TargetRef; at: Timestamp }[]`
   lists every deadline that a `Timeout` may resolve.
8. `restoreSession(engine, snapshotState, tail)` rebuilds a session from a
   snapshot plus log tail and throws `ReplayDivergenceError` on mismatch.
9. Every new state key and event type is classified in `STATE_VISIBILITY` /
   `EVENT_VISIBILITY`; no hidden information exists in stage 1, so all public.
10. Deterministic tests for each rule above, boundary tests at
    `deadline - 1`, `deadline`, `deadline + 1`, a seeded multi-turn replay test
    and a property test that replaying any accepted log reproduces state and
    events. Existing tests stay green.
11. `rulesVersion` bumped (for example `core-2`) because transitions and the
    RNG stream change; `core-1` is no longer supported, which is acceptable
    because no persisted games exist.

## Scope and non-goals

In scope: `packages/game-core/src/**`, its tests, an OpenSpec change for the
new rules and contracts.

Not in scope: money, rewards, real `CLASSIC_40` layout, final jail rules,
settlement logic beyond a no-op hook, lobby leave/kick, any server/protocol/
client code.

## Canonical references

- `docs/efforts/stage-1-skeleton.md` revision 2.
- `docs/efforts/stage-1-skeleton/design.md` § "Core additions".
- `ROADMAP.md` stage 1 including "Решения владельца (приняты 2026-11-14)".
- `GAME-BREAKDOWN.md` § "Порядок ходов, ход и кости".
- `openspec/config.yaml`, `openspec/specs/engine/*`.

## Constraints and invariants

Headless deterministic core: no timers, clock, global random, I/O. Time and
entropy only through `TransitionContext`. A rejected command never mutates
state or consumes randomness. One revision increment per accepted command.
Target ids are never reused within a game.

## Dependencies

Starts after `TASK-s1-ci` merges (handoff revision 2 is on `main`). Runs in
parallel with `TASK-s1-protocol`; the protocol task imports only exported
types from this package. Publish command, event and state type names in the
proposal so the protocol task can align; the Team Lead relays them.

## Delegated decisions

Internal state shape, module split, event payloads, test helpers, the
`rulesVersion` string, the placeholder jail cell index. Return to the Team Lead
before changing an exported contract named in the design. Any product rule not
listed above goes to the Team Lead, who escalates to the CTO; do not guess.

## Required workflow

Explore -> Propose (OpenSpec change, proposal checkpoint reported with
`agentctl engineer report --wake`) -> Team Lead approval -> Apply in a fresh
context -> Verify -> PR -> Review fixes.

## Required checks

`pnpm build`, `pnpm test`, the new replay and boundary tests, green CI on the
PR head, `git diff --check`, OpenSpec validation of the change.

## Escalation conditions

A rule interpretation that changes observable behavior; a case the rules do
not cover (for example a prisoner reaching a third double); a needed change to
an existing accepted spec; inability to prove a criterion deterministically.

## Deliverables

OpenSpec change, code and tests, branch `agent/task-s1-core-turns`, PR, CI
evidence, independent review report, residual risks.

The Engineer accepts the exact revision before editing. A material change
creates a new revision.
