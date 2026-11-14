# Tasks

## 1. Monorepo scaffold

- [x] 1.1 Create root `package.json` (private workspace), `pnpm-workspace.yaml` listing `packages/*` and `apps/*`, and `tsconfig.base.json` (strict, ESM, NodeNext); verify `pnpm install` exits cleanly
- [x] 1.2 Create `packages/game-core/package.json` (name `@game/game-core`) and `packages/game-core/tsconfig.json` extending base; verify `pnpm --filter @game/game-core exec tsc --noEmit` succeeds on an empty `src/index.ts`
- [x] 1.3 Create `apps/server/package.json` with `workspace:*` dep on `@game/game-core` and its `tsconfig.json`; verify `pnpm --filter server exec tsc --noEmit` succeeds on an empty `src/index.ts`
- [x] 1.4 Create `apps/client/package.json` and its `tsconfig.json` (browser target); verify `pnpm --filter client exec tsc --noEmit` succeeds on an empty `src/index.ts`

## 2. game-core contracts (spec: engine/contracts)

- [x] 2.1 Implement branded primitive types (`Money`, `PlayerId`, `AssetId`, `CommandId`, `Revision`, `Timestamp`) in `packages/game-core/src/types.ts`; verify a companion test that assigns a plain `number` to `Money` fails to compile (`tsc --noEmit` exits non-zero on that file)
- [x] 2.2 Implement `DeterministicRng` interface and `TransitionContext` in `packages/game-core/src/context.ts`; verify the file contains no reference to `Math.random`, `Date.now`, or `new Date` (grep assertion in test)
- [x] 2.3 Implement `GameCommand`, `GameEvent`, `AcceptedResult`, `RejectedResult`, `TransitionResult`, `GameEngine`, and `Transition` generics in `packages/game-core/src/engine.ts`; verify `tsc --noEmit` passes
- [x] 2.4 Implement `Q(x: number): Money` in `packages/game-core/src/money.ts` using integer `Math.floor` only; verify vitest unit tests: `Q(1259) === 1250`, `Q(1260) === 1260`, `Q(0) === 0`, `Q(15) === 10`
- [x] 2.5 Export all public types and `Q` from `packages/game-core/src/index.ts`; verify `tsc --noEmit` on the whole workspace passes clean

## 3. Contract fixture tests (spec: engine/contracts determinism)

- [x] 3.1 Write a fixture test in `packages/game-core/src/__tests__/contracts.fixture.test.ts` that constructs a minimal `GameEngine` stub and runs: (a) accepted transition — revision increments by 1, (b) rejected transition — state reference-equal, revision unchanged, events empty; verify vitest passes
- [x] 3.2 Write a boundary test verifying `packages/game-core/src/index.ts` and its transitive local imports contain no reference to `Math.random`, `Date.now`, `fetch`, `fs`, `net`, `http`, or `process.env`; verify the test passes

## 4. Apps shells wired up

- [x] 4.1 Add `import type { GameEngine } from '@game/game-core'` to `apps/server/src/index.ts` and re-export it; verify `pnpm --filter server exec tsc --noEmit` passes, confirming the cross-package import resolves
- [x] 4.2 Confirm `apps/client/src/index.ts` compiles independently (it does NOT import game-core — client talks to server); verify `pnpm --filter client exec tsc --noEmit` passes

## Workflow follow-up

- Run `openspec validate --change monorepo-engine-foundation` before archiving.
- Archive the change once all tasks are checked off.
