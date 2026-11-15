# Design

## Context

Base 25fef63 already migrates and restores rooms before listen, with graceful snapshots on shutdown. RoomManager accepts injected entropy; lobby CreateGame separately obtains a crypto random seed. Root build is typecheck only; client bundle needs build:bundle. Existing CI has Node 22 and real Postgres integration tests. Client-lobby is not yet in this base. See proposal.md for scope and governing sources.

## Goals / Non-Goals

Goals: prove the shipped browser UI against the real server and database; keep one origin and deterministic rare-event evidence.
Non-goals: change deadlines, manipulate database game states, substitute mock sockets, or fix product failures discovered by scenarios.

## Decisions

1. Three services: db (Postgres 16, named volume, readiness), server (Node 22/pnpm 9.15.9, existing tsx entry and migrations), web (multi-stage Vite build, nginx static delivery plus /api and /ws upgrade proxy). Only web publishes 127.0.0.1:8080; db/server remain private. Server listens on the container network interface, not the host. Separate web avoids adding static-serving behavior to Fastify; Vite dev/preview is not the deployment server. SPA fallback preserves invite links. No committed secrets: ignored env file with example and documented initialization; no public VPS endpoint.
2. Explicit E2E_TEST_SEED, strictly validated and rejected unless NODE_ENV=test, selects deterministic context in the process entry. Inject game-seed generation into the existing lobby service and transition entropy into RoomManager; default dependencies stay crypto-backed. Put the generator in server context rather than importing test helpers into production. No new HTTP test endpoints or client dice inputs. Discover and pin a fixture seed using the actual core and complete command sequence; do not force dice results. Include guard unit/process tests and reproducibility assertions.
3. Existing seededEntropy is unsuitable for naive restart reuse: it also supplies timeout IDs. Restart recovery scenario uses the default CSPRNG stack; deterministic rare-dice scenario uses a fresh isolated database and does not restart. Test override sets the test environment only, never the production Compose file. A deterministic restart is not claimed. Seed search includes lobby seed and accepted non-roll transitions.
4. Playwright Chromium contexts are independent guests. UI actions cover two/three players, setup (including ties), several turns, reload, locked-code/invite joins, noncreator leave and creator room closure, resignation to winner, third double jail and interim jail behavior. Assertions use visible screen state and observed server frames/events for precise turn/revision/position/deadline evidence; no direct mutation. Restart only the server service using Compose and verify same room/players plus successful subsequent action. AFK test waits actual 45 s + 20 s deadlines and verifies auto-roll, same-turn continuation and eventual turn close; no shortened rules.
5. Dedicated CI Compose browser job installs Chromium, builds the stack, waits readiness and runs serial isolated scenarios with bounded retries disabled for evidence. Always upload traces (all scenarios), short per-scenario logs, Playwright report and Compose logs; exclude tokens/access credentials. Allow a longer job timeout for real deadlines. Keep existing unit/integration checks, add client bundle build and pinned OpenSpec CLI 2.0.0 strict validation. Prefer CI to local-only evidence; if infeasible, escalate per handoff rather than silently bypassing it.
6. Before archive, normalize the four old changes and engine/command-execution strict failures without changing semantics (move explanatory detail into scenarios, preserve requirements). Correct protocol D5 to match reviewed runtime checks and resignation proposal scope per cited reviews. Archive via installed CLI and archive skill: protocol-stage-1-frames before server-api; server-rooms before server-api; core resignation before dependent client-lobby; client-stage-1-skeleton before client-lobby. Reconcile current main and exact delta dependencies after client-lobby merges; validate after each archive. Check every unchecked historical task against existing CI/review evidence instead of blindly checking boxes. Archive this change only after delivery/merge per policy. Update ROADMAP “Сделано” only, leaving product text intact.

## Risks / Trade-offs

- Real deadlines increase CI duration → serial suite with explicit per-scenario timeouts and retained evidence; no timing rule changes.
- Client-lobby UI may differ at Apply → reread merged code and selectors before implementation; report product failures to Team Lead.
- Legacy archive overlaps → preserve base-first ordering and inspect synced spec diff after each CLI archive; do not use skip-validation or hand-move archives.
- Production deployment evidence is localhost only → run on VPS via sg docker and record bindings, never expose a port publicly.

## Migration Plan

After Team Lead approval and explicit client-lobby merge confirmation, restart in fresh Apply context on updated main. Verify production stack from clean checkout plus test override scenarios. Preserve named database volume during normal down/up. Rollback by running prior image/branch against unchanged schema; this task adds no database migrations. Remove test volumes explicitly only during isolated test cleanup. Record final main CI after integration through Team Lead; Engineer does not merge.
