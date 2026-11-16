# Tasks

## 1. Server transport configuration

- [x] 1.1 Extend existing main-config parsing and tests for server/service “Browser origin configuration” and “Version health endpoint”; cover valid lists, invalid syntax, unset/empty lists and absent SHA; verify server typecheck and focused unit tests.
- [x] 1.2 Add a transport-origin hook module and wire server dependencies/startup for server/service “API CORS grants” and “WebSocket origin gate”; test allowed/foreign simple requests and preflights, missing/foreign raw upgrades returning 403 without frames, allowed upgrades, and disabled-list compatibility; verify focused server tests and typecheck.
- [x] 1.3 Register unauthenticated health in existing server composition for server/service “Version health endpoint”; test exact JSON with/without SHA and startup migration-before-listen ordering in service integration tests; verify server integration tests.

## 2. Client runtime origin

- [x] 2.1 Add one runtime URL helper module and wire browser composition for client/connection “Runtime API origin”; test HTTPS/WSS, HTTP/WS, empty/absent defaults and REST target URLs without cookies; verify client tests and typecheck.
- [x] 2.2 Preserve initialUrl and extend invite tests for client/connection “Client origin invites”; verify distinct API and client host yields an invite on the client origin with room/code retained.
- [x] 2.3 Add one standalone startup config script plus entrypoint invocation and static empty config for development for deployment/compose “Web container runtime configuration”; test valid/empty values, invalid origins, injection strings, strict shell whitelist safety and no unrelated env exposure; verify script tests and client bundle build.

## 3. Container delivery

- [x] 3.1 Update existing Dockerfiles and Compose build args/healthcheck for deployment/compose “Build version plumbing”; verify images built with and without SHA return matching health/version values and health stays unauthenticated.
- [x] 3.2 Update nginx config for deployment/compose “Client delivery cache policy”; verify built container headers on index, SPA fallback, config, version and hashed assets, and invalid API_ORIGIN prevents startup.

## 4. Integrated verification and delivery

- [x] 4.1 Run pnpm build, pnpm test, pnpm test:integration, client build:bundle, openspec validate --all --strict and git diff --check; record results and compare final diff against all nine handoff acceptance criteria.
- [x] 4.2 Push branch agent/task-dep-config and open PR using recorded agentctl external operations; verify unchanged Compose browser suites pass in CI on exact PR head.
- [x] 4.3 Start independent review with agentctl review start, resolve supported findings and obtain exact-head passing review evidence; report residual risks and request Team Lead acceptance through agentctl.

## Workflow follow-up

- Archive the change in the PR after independent review passes, as required by the task handoff; validate archived specs and refresh exact-head checks/review evidence for the archive commit.
- Do not merge the PR; Team Lead acceptance and merge policy apply.

## Review disposition and archive round

- REV-dep-config-2 PASS on 6944d3f; CI run 43883150090 passed both jobs on that head.
- RVW-001: Team Lead amended the whitelist to require explicit ports in 1..65535. Shell validation and regression tests implement the refinement.
- RVW-002: Reject non-canonical ALLOWED_ORIGINS at startup by comparing each entry with its URL origin serialization; regression tests cover uppercase hosts, explicit default ports and other non-canonical forms.
- RVW-003: Team Lead owns the handoff revision-history note; no Engineer change required.
- Archive round: rerun required checks and both CI jobs on the archive commit, then start REV-dep-config-3 for 6944d3f..new head (full task base 4347800) before Team Lead merge acceptance.
