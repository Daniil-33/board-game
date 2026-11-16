# Team Lead -> Engineer Task Handoff

```yaml
id: TASK-dep-config
revision: 1
effort: EFF-deploy-staging-production
project: economic-board-game
source_commit: 78478c6 # main with the effort handoff
owner: team-lead
status: proposed
```

## Outcome

The server and client can run behind separate per-environment hosts: the
client talks to a configured API origin, the server accepts browser origins
from a configured list only, and both expose the commit they were built from.

## Acceptance criteria

1. Server `ALLOWED_ORIGINS` (comma-separated exact origins such as
   `https://stage.focusima.space`):
   - set: `/api/*` answers CORS for those origins only (preflight allows
     `Authorization` and `Content-Type`, the methods the client uses, no
     credentials/cookies); requests from other origins get no CORS grant;
     WebSocket upgrades on `/ws` whose `Origin` is not in the list are
     rejected before any frame;
   - unset or empty: behaviour identical to today (same-origin through the
     web container; no CORS headers; WebSocket accepted).
   Invalid values (not `scheme://host[:port]`) fail startup with the variable
   name, like the existing config errors.
2. Server `GET /api/health` (no auth) returns `200 {"status":"ok","sha":"<GIT_SHA>"}`
   once migrations are applied and the server accepts traffic; `GIT_SHA`
   comes from the environment (`"unknown"` when absent). The Compose
   healthcheck may switch to it.
3. Client runtime API origin: the web container serves `/config.js`, generated
   at container start from `API_ORIGIN` (e.g. `https://stage-api.focusima.space`);
   the client uses it for REST and builds the socket URL as `wss://`/`ws://` of
   that origin. Empty or absent `API_ORIGIN` keeps today's same-origin URLs.
   The value is validated (origin only) and HTML/JS-escaped; no other
   variables are exposed.
4. Client `/version.txt` contains the `GIT_SHA` build arg (`unknown` when
   absent), served without caching; `index.html` and `config.js` are served
   with `Cache-Control: no-cache`, hashed assets stay cacheable.
5. Dockerfiles accept `GIT_SHA` as a build arg (server: runtime env; client:
   `/version.txt`). `docker-compose.yml` passes `GIT_SHA` with default
   `unknown`; local Compose, the e2e stacks and the owner preview work
   unchanged without new variables.
6. Invite links keep working when client and API hosts differ (the link uses
   the client origin).

Technical proof:

7. Server tests: config parsing (valid/invalid lists), CORS preflight and
   simple request for an allowed and a foreign origin, WebSocket upgrade
   accepted/rejected by origin, health endpoint with and without `GIT_SHA`,
   unset-list behaviour unchanged.
8. Client tests: API/socket URL from config (https->wss, http->ws, empty ->
   same origin); config.js generation escapes and rejects non-origin input
   (shell or node script test).
9. Compose browser suite passes unchanged in CI (same-origin path).

## Scope and non-goals

In scope: `apps/server/**`, `apps/client/**` (including Dockerfiles and the
container nginx config), `docker-compose.yml` (only `GIT_SHA` plumbing and
healthcheck), OpenSpec deltas for server/client/deployment as needed.

Not in scope: the edge proxy, deploy scripts, workflows (sibling tasks);
rate limits or token lifetime (stage 8); game rules.

## Canonical references

- `docs/efforts/deploy-staging-production.md` revision 1 (C1, C7).
- `docs/efforts/deploy-staging-production/design.md` § "Delegated decisions"
  (per-environment API host, version visibility).
- `openspec/specs/server/*`, `openspec/specs/client/*`,
  `openspec/specs/deployment/*`.

## Constraints and invariants

Server authoritative; no rules logic changes; no cookies; tokens stay in the
`Authorization` header; never log tokens or access codes; bind behaviour
unchanged (`HOST`).

## Dependencies

None upstream. Runs in parallel with `TASK-dep-stack`, which relies on the
names above (`ALLOWED_ORIGINS`, `API_ORIGIN`, `GIT_SHA`, `/api/health`,
`/version.txt`, `/config.js`). Do not edit `deploy/**` or workflows.

## Delegated decisions

CORS implementation (plugin or hook), config.js generation mechanism,
test helpers. Return to the Team Lead before changing the names above or the
unset-variable behaviour.

## Required workflow

Explore -> Propose (OpenSpec change, proposal checkpoint reported with
`agentctl engineer report --wake`) -> Team Lead approval -> Apply -> Verify ->
PR -> start the independent review yourself (`agentctl review start`) ->
review fixes. Archive the OpenSpec change in the PR once review passes.

## Required checks

`pnpm build`, `pnpm test`, `pnpm test:integration`, client bundle build,
`openspec validate --all --strict`, `git diff --check`, green CI on the PR
head.

## Escalation conditions

A needed protocol or game-core change; a conflict with the stage 1 access
model; anything that would expose a new public port.

## Deliverables

OpenSpec change, code and tests, branch `agent/task-dep-config`, PR, CI
evidence, independent review report, residual risks.

The Engineer accepts the exact revision before editing. A material change
creates a new revision.
