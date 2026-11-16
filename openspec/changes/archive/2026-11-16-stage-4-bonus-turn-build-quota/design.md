# Design

## Context
`startTurn` in `turns.ts` copied `state.turn.quotas.builds` into a bonus turn. The Team Lead design table (stage 4 design.md, "Build counter") now says the counter resets to 1 at the start of every turn, bonus turns included.

## Decisions
- `startTurn` always uses `TURN_QUOTAS`. No new state; continuation (`Timeout` before the roll) and auction resume keep the same turn and therefore its quotas, unchanged.
- Selling stays quota-free and never restores a build.

## Risks / Trade-offs
- Golden and replay fixtures did not exercise a build before a bonus turn, so no recorded trajectory changes; the full core suite confirms this.
