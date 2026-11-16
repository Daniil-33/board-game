# Proposal

## Why

Staging and production use separate client and API hosts. Current relative REST URLs, same-origin sockets and unversioned containers cannot support those hosts or prove which commit is running.

## What Changes

- Configure exact browser origins through server `ALLOWED_ORIGINS`, with API CORS and HTTP 403 before disallowed WebSocket upgrades; preserve unset behaviour.
- Expose unauthenticated `/api/health` with status and `GIT_SHA` after startup migrations and restoration.
- Generate client `/config.js` from validated `API_ORIGIN` at container startup; use it for REST and sockets while retaining client-origin invite links.
- Publish build SHA through `/version.txt`; prevent stale HTML, config and version responses while retaining cacheable hashed assets.
- Pass `GIT_SHA` through Docker builds and local Compose, defaulting to `unknown`.

Out of scope: edge proxy, deploy scripts, workflows, public ports, rate limits, token lifetime, protocol changes and game rules. This preserves GAME-BREAKDOWN.md sections “Обязательные качества/приёмка” and “Архитектурные контракты”; no mechanics change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `server/service`: configured browser-origin boundary and version health endpoint.
- `client/connection`: configurable REST/socket API origin and client-origin invites.
- `deployment/compose`: startup runtime configuration, cache policy and build version plumbing.

## Impact

Only `apps/server/**`, `apps/client/**`, `docker-compose.yml` and this OpenSpec change. No new package is required. Existing same-origin local, preview and e2e stacks retain their defaults. Implements TASK-dep-config revision 1 against base f08fefc; configuration names are shared contracts with TASK-dep-stack.
