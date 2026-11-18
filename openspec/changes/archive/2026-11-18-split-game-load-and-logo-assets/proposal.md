# Proposal

## Why

The initial login route currently imports game presentation and Pixi code, increasing bytes downloaded before the player needs them. The brand logo URLs are emitted and eagerly referenced as a full set, although each screen uses only a small subset.

## What Changes

- Keep login, lobby, and waiting-room loading independent of the game screen, Pixi board, and sound engine; load the game presentation on entry while preserving session-driven transitions and reload recovery.
- Resolve and request only logo assets that the visible game screen uses, while keeping logo files separate from JavaScript and retaining monogram fallback behavior.
- Optimize SVG logo files only where a rendered comparison meets the handoff's no-visible-change tolerance; report assets that cannot meet the size cap without a visible change.
- Record initial and lazy bundle sizes, network requests, staging Lighthouse measurements, and before/after logo sizes as task evidence.

Out of scope: changes to game rules, protocol or server behavior; a media service or CDN; edge/nginx configuration; new visuals; and production deployment.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `client/session`: defer game-only code until game entry while retaining existing login, lobby, room, reconnect, invite, and game screen transitions.
- `client/logos`: keep URL resolution side-effect free and request only the logos rendered by the active game screen.
- `client/game-screen`: preserve game presentation and reconnect behavior when the screen is loaded asynchronously, including direct reload on the game URL.
- `client/sound`: activate the shared audio context from the always-loaded shell gesture gate while keeping the engine and audio files in the lazy game chunk.

## Impact

Affected areas are the Vue client screen composition and bootstrap, game widgets and Pixi mounting, the logo URL resolver and SVG assets, Vite output configuration, browser specifications, and OpenSpec contracts. There are no server or protocol changes. The client adds Terser as a build-time minifier to stay within the emitted-JavaScript budget. Relevant game profile context is under GAME-BREAKDOWN.md headings “MVP: что входит и что отложено” and “Игровой процесс”; no rule behavior changes.
