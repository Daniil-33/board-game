# Proposal

## Why

The `game/` directory has no code at all — only the product spec (`GAME-BREAKDOWN.md`) and OpenSpec tooling. Before any gameplay feature can be implemented, the project needs a TypeScript monorepo with three distinct layers: a pure deterministic game-core, a backend service shell that will host it, and a frontend client shell. This change establishes the skeleton without any game logic — just the structural boundaries and engine contracts that every future change will build on.

## What Changes

- Initialize a `pnpm` workspace with `packages/game-core`, `apps/server`, and `apps/client`.
- Define domain-neutral TypeScript contracts in `packages/game-core`:
  - Branded primitive types (`Money`, `PlayerId`, `AssetId`, `CommandId`, `Revision`, `Timestamp`)
  - `TransitionContext` — explicit `rng: DeterministicRng` and `now: Timestamp`; no global random or clock
  - `GameCommand`, `GameEvent`, `TransitionResult` (`accepted` | `rejected`), `GameEngine`
  - Monetary quantization helper `Q(x) = 10 × floor(x/10)` — integer arithmetic, no floating point
- Add `apps/server` as an empty Node.js package that declares a dependency on `packages/game-core` — shell only
- Add `apps/client` as an empty browser package — shell only, no framework chosen yet
- Configure TypeScript strict mode and vitest across all packages
- Add contract fixture tests (compile-time type checks + Q unit tests)

## Capabilities

### New Capabilities

- `engine/contracts`: Domain-neutral contracts for deterministic state transitions, identity types, monetary arithmetic, and engine interface. No gameplay behavior — purely the technical skeleton future changes implement on top of.

### Modified Capabilities

_(none — greenfield project)_

## Impact

- New files: `package.json` (root), `pnpm-workspace.yaml`, `tsconfig.base.json`, `packages/game-core/`, `apps/server/`, `apps/client/`
- No runtime dependencies beyond TypeScript and vitest
- No gameplay logic, no product rules — this change is infrastructure-only
- `GAME-BREAKDOWN.md` and `openspec/` remain unchanged

## Out of Scope

- Any game mechanics, board layout, player state, or rules (see GAME-BREAKDOWN.md §"Принятые технические границы и текущая реализация")
- Concrete game commands (buy, roll, auction, etc.) — those come in subsequent changes
- Server transport (WebSocket, HTTP) or client rendering framework — empty shells only
- Multiplayer, persistence, Discord/Steam integrations
