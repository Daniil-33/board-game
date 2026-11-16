# Design

## Context

See proposal.md for motivation. Base f08fefc uses Fastify with @fastify/websocket, relative REST paths in the injected browser fetch function, a same-origin socketUrl helper, and nginx SPA delivery. main.ts migrates and restores before listening. Server invite links are relative; createClient resolves them against initialUrl. No persistence or protocol migration is needed.

## Goals / Non-Goals

Implement the three delta specs within TASK-dep-config revision 1. Keep origin enforcement at the transport boundary and keep origin selection at browser composition. Do not change domain code, authentication semantics, ports or sibling deployment files.

## Decisions

1. Extend main-config with allowedOrigins and gitSha; pass them as optional server dependencies for existing test callers. Validate comma-separated entries with URL parsing plus strict origin-only syntax: HTTP(S), no credentials, path (including trailing slash), query or fragment; trim surrounding list whitespace and reject empty list entries. Compare incoming Origin exactly against configured strings. Preserve HOST and disabled-list defaults.
2. Use small Fastify hooks, without a new CORS package. A root onRequest hook handles API grants and preflight before auth; grants only configured origins, adds Vary: Origin, permits GET/POST and Authorization/Content-Type, and never grants credentials. A /ws preValidation hook rejects absent/foreign Origin with 403 before the websocket handler. Verify actual raw upgrade status with ws clients rather than only injection tests. This keeps CORS logic bounded to the needed methods instead of adding dependency configuration.
3. Register health during createServer, sourcing SHA through dependencies. main.ts retains migration/restore/listen ordering, making health reachable only after readiness. Use it for the local Compose server healthcheck.
4. Add a small client runtime URL helper; keep ROUTES relative for mock server and tests. At main.ts composition prefix REST paths with configured API origin and derive socket protocol/host from that origin or window.location. Keep initialUrl equal to window.location.href and verify invite origin. Set fetch credentials to omit for configured cross-origin API calls.
5. Generate config with a standalone Node script copied into the nginx image, using a minimal Node runtime installed in that image. Invoke it from /docker-entrypoint.d before nginx starts. This avoids shell interpolation and permits standard URL validation and JSON serialization; additionally escape HTML-sensitive characters and Unicode line separators. Only API_ORIGIN is serialized into window runtime config. Alternative shell-only JSON escaping is too error-prone. Provide a static empty config for Vite/local builds; entrypoint overwrites it for containers.
6. Declare Docker GIT_SHA build args with unknown default: server ENV and client version file. Add explicit nginx no-cache locations and cacheable hashed assets, including no-cache SPA HTML fallback. Compose changes are limited to build args and healthcheck.

## Risks / Trade-offs

- Origin checks constrain browser access, not token-based authentication → retain all existing auth and protocol checks.
- Fastify hook ordering could accidentally upgrade before rejection → real socket tests assert HTTP 403 and no frames for missing and foreign Origin.
- Runtime config could become executable markup → validate before writing, serialize without shell evaluation, escape script-sensitive characters, test malicious inputs and exposure of unrelated env vars.
- Node increases web image size → keep only the runtime required for safe startup generation; no package install at startup.
- New cache locations could bypass SPA/proxy behaviour → verify response headers and same-origin browser suite against built containers.

## Migration Plan

No data migration. Existing deployments require no new variables. Build both images with GIT_SHA; staging/production sibling task supplies API_ORIGIN and ALLOWED_ORIGINS. Rollback restores earlier images and their matching runtime config. Proposal approval is required from Team Lead before Apply, per task handoff; start Apply in a fresh Engineer context with this change and revision 1.
