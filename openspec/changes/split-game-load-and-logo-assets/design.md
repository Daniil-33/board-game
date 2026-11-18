# Design

## Context

See proposal.md for motivation. The app currently selects screens from the
client session rather than a URL router. Its bootstrap statically imports
Pixi board mounting and sound, and the app statically imports game screens.
The logo resolver creates URL strings from Vite's asset map; the actual fetch
is caused by the rendered image or texture consumer.

## Goals / Non-Goals

**Goals:** preserve session transitions, room reconnect, direct reload, and
game behavior while deferring game-only code; prove initial and lazy output,
logo requests, visual logo fidelity, and staging performance.

**Non-Goals:** introduce URL-routing semantics, alter game/protocol/server
behavior, add an asset service, or change edge configuration.

## Decisions

- Keep the session state machine as the navigation authority. Put the game
  screen behind an async loading boundary and ensure its board mount, Pixi,
  game-only dialogs/widgets, and sound engine are reachable only through that
  boundary. This preserves existing transitions and avoids introducing a
  second source of navigation state. A router-based design was considered but
  would expand the task and complicate invite/session recovery.
- Keep the shared logo resolver side-effect free and retain external URL
  assets. The screen's rendered consumers determine network requests; do not
  preload the set or add a runtime fetch to the resolver. Verify this with a
  real browser network log through login, lobby, room, and game.
- Optimize SVGs with SVGO safe settings, then compare rasterized renderings
  per changed file. Keep any asset that would exceed the handoff's visual
  tolerance unchanged and raise it with the Team Lead instead of accepting a
  visible alteration.
- Compare emitted JS by chunk with Node zlib against the merge base, and
  report initial-route and deferred chunks separately while enforcing the
  all-emitted-JS gzip total budget of 343,863 bytes. Enable and inspect the
  Vite manifest. Capture staging Lighthouse and transferred
  bytes before and after using the Playwright/Chromium container.
- Compare each changed brand SVG at 512x512 and 1024x1024 RGBA raster sizes.
  A candidate passes when no more than 0.5% of pixels exceed a maximum
  per-channel delta of 16 and no pixel exceeds 64. Keep and report oversize
  exceptions in the effort summary with raw/gzip sizes and reasons.

## Risks / Trade-offs

- **Session changes during import could show stale data** → the async boundary
  must receive the live client/session and render the latest view after load;
  cover a view update during loading and direct reload in browser specs.
- **A static import may pull Pixi or sound into a shared chunk** → inspect the
  Vite manifest and browser resource log, not only source-level imports.
- **SVG simplification may alter a logo** → use per-file rendered diffs and
  the stated tolerance; preserve originals for any failure and escalate.
- **Staging measurements may vary** → use the same Chromium/Lighthouse setup,
  URL, viewport, and network profile for the before and after measurements,
  and retain raw reports and transferred-byte logs.

## Migration Plan

No server or data migration is needed. Deploying the client build serves its
hashed JS and SVG assets as usual. Rollback is a client build rollback.
