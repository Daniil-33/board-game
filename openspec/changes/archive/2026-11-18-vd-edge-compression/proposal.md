# Proposal

## Why

Staging sends the client JavaScript, CSS and logos without compression and negotiates HTTP/1.1 at the shared edge. Compressing text responses and serving HTTP/2 reduces transferred bytes and improves browser loading without changing game behavior.

## What Changes

- Enable gzip for HTML, JavaScript, CSS, SVG and JSON responses in the client nginx and shared edge; use a sensible minimum size and `Vary: Accept-Encoding`.
- Keep immutable caching for hashed `/assets/`, and leave already-compressed image formats uncompressed.
- Serve HTTPS through HTTP/2 at the edge and use HTTP/1.1 to the web upstream so the client nginx can compress proxied responses. Preserve `/api/` and `/ws` proxy behavior.
- Extend the isolated edge deployment test to verify compressed JS, CSS, SVG and JSON, HTTP/2, API proxying and WebSocket upgrade. Record a failing run against the old edge and a passing run against the new edge.
- Record staging transferred-byte and Lighthouse mobile measurements before and after the CTO-coordinated staging-only edge update.

Out of scope: gameplay rules and the "MVP: что входит и что отложено" section of `GAME-BREAKDOWN.md` remain unchanged; client code, logo assets, route splitting, production deployment and shared-edge operations are excluded.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `deployment/public`: HTTP/2 browser transport, compressed responses through the edge, and preserved upstream API/WebSocket routing.
- `deployment/compose`: gzip delivery of text responses by the web container, retaining hashed asset caching.

## Impact

Changes are limited to `deploy/edge/**`, `apps/client/nginx.conf`, `deploy/tests/**`, and this OpenSpec change. No API schema or runtime dependencies change. Staging after-measurements depend on a separately recorded edge update coordinated by the CTO; production remains unchanged.
