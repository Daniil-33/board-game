# Proposal

## Why
Owner decision 2026-11-16 (TASK-s4-client handoff revision 2, docs PR #52): a double's bonus turn is a new turn and allows one more house. The merged stage 4 core (PR #51) let a bonus turn inherit the remaining build quota of the turn that granted it.

## What Changes
- `startTurn` gives every turn, bonus turns included, the full quotas (one build, two offers).
- A timeout continuation and an auction pause still keep the current turn's quotas; selling still never restores the build quota.
- Tests: a bonus turn resets the quota, one house in the regular turn and another in its bonus turn, selling never replenishes; the merged "bonus inherits" test is replaced.

## Capabilities
### New Capabilities
None.
### Modified Capabilities
- `engine/turn-cycle`: a bonus turn starts with a fresh build quota.

## Impact
`packages/game-core/src/turns.ts` only (plus a doc comment in `state.ts`). No state shape, event or protocol change; the projected `turn.quotas.builds` simply reads 1 at a bonus turn start. Replay of a stored log can differ only where a bonus turn followed a build, which core-6 games on main have not shipped to production.
