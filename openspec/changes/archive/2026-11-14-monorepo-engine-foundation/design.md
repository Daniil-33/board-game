# Design

## Context

Greenfield project. The `game/` directory contains only `GAME-BREAKDOWN.md` and OpenSpec tooling — no source code exists. The architectural constraint (from GAME-BREAKDOWN.md §"Принятые технические границы") requires an absolute boundary: the game core must be a pure function library with no I/O, timers, or global state, so that any future transport (WebSocket, HTTP, local simulation) can wrap it without modification.

## Goals / Non-Goals

**Goals:**
- Working TypeScript monorepo that compiles cleanly with `tsc --noEmit` across all packages
- `packages/game-core` exports contracts only — no concrete game state or commands yet
- `apps/server` and `apps/client` exist as importable empty shells
- Monetary `Q()` function is tested and returns integer `Money` values
- Contract fixture tests cover compile-time type safety and determinism boundary

**Non-Goals:**
- Any game mechanics, board, player state, or business rules
- Server transport layer (WebSocket, HTTP routes) — shell only
- Client rendering or framework selection — shell only
- Concrete `GameCommand` subtypes (those come in the next change)

## Decisions

### D1: `packages/game-core` + `apps/server` + `apps/client`

Three-layer split matches the domain:
- `packages/game-core` — pure TypeScript, zero runtime deps, importable anywhere
- `apps/server` — Node.js runtime, owns transport and sessions, depends on `game-core`
- `apps/client` — browser runtime, talks to server, never imports `game-core` directly

This enforces the boundary at the module-resolution level. If server code ever imports something that pulls in browser globals, it fails at the package boundary before reaching game-core.

### D2: pnpm workspaces over npm/yarn

pnpm's symlink approach gives fast installs and hard boundaries between packages. `workspace:*` protocol makes inter-package dependencies explicit without publishing. Monorepo root is `private: true`.

### D3: Branded types via `unique symbol` trick

```ts
declare const _brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [_brand]: B };
```

Zero-cost at runtime (symbol never appears in emitted JS), full compile-time safety. Alternatives: class wrappers (runtime overhead), opaque types via io-ts (heavy dep). The symbol trick is idiomatic in strict TS codebases.

### D4: `Q` as a plain `number → Money` function

Monetary quantization is a pure function. Making it a standalone `Q(x)` keeps call sites readable: `Q(price * 0.5)` vs `Money.quantize(price * 0.5)`. All intermediate arithmetic stays as `number`; only the boundary call uses `Q`.

### D5: `DeterministicRng` interface, not a class

```ts
interface DeterministicRng { next(): number; }
```

Any object with `next()` satisfies the contract. Tests can pass `{ next: () => 0.5 }`. No base class, no inheritance.

### D6: vitest over jest

vitest has native ESM support, faster cold start, and no need for `ts-jest` transform config. The project has no prior test framework lock-in.

## Risks / Trade-offs

- `unique symbol` brands are erased at runtime — a cast like `x as Money` bypasses the type check. Mitigation: `Q` is the only place that casts to `Money`; callers never cast directly.
- Three packages from day one is slightly more setup than a single package. Mitigation: the split is load-bearing for the architecture; GAME-BREAKDOWN.md explicitly requires the core to be isolated from transport and UI.

## Open Questions

_(none — this is infrastructure with no product rule decisions)_
