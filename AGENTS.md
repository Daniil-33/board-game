# Economic Board Game — agent entry point

Browser economic board game for 2–6 players: a TypeScript pnpm monorepo with a
pure deterministic rules core, an authoritative room server and a web client.

## Canonical sources

Read only what the task needs, in this order of authority:

1. `ROADMAP.md` — vision, accepted tech stack, MVP criteria, stage order and
   owner decisions per stage.
2. `GAME-BREAKDOWN.md` — the game rules profile (what is accepted vs open).
3. `docs/proposals/` — accepted product proposals (e.g. stage 2 catalog,
   prices, layout).
4. `docs/efforts/` — effort handoffs and their task handoffs.
5. `openspec/config.yaml` (architecture constraints) and `openspec/specs/`
   (accepted behaviour specs); changes go through `openspec/changes/`.

Silence in these sources does not authorise inventing product rules: ask.

## Layout

- `packages/game-core` — rules engine: pure functions, no I/O, no timers, no
  global randomness; time and entropy come through the transition context.
- `packages/protocol` — client/server message schemas.
- `apps/server` — Fastify + WebSocket room server, PostgreSQL log/snapshots.
- `apps/client` — Vite, Vue 3 UI, PixiJS board.

## Commands

- `pnpm install --frozen-lockfile` (pnpm 9.15.9, pinned by `packageManager`)
- `pnpm build` — typecheck all packages
- `pnpm test` — unit tests; `pnpm test:integration` needs Postgres
- CI runs the same on every PR.

## Working rules

- Money is integer quanta: `Q(x) = 10 × floor(x/10)`, no floating point.
- Replay must stay exact: same seed, config and ordered inputs give identical
  state and events.
- Work on a branch and open a PR; never push to `main`. The owner and VM agents
  work in parallel.
- A PR that carries a product decision is merged by the owner.
