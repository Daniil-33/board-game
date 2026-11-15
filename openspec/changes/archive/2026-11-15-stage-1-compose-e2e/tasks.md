# Tasks

## 1. Apply prerequisites

- [x] 1.1 In fresh context verify Team Lead proposal acceptance and client-lobby merge confirmation, update branch from current main, reread merged client/server contracts and review references; record exact SHAs through agentctl before code edits.

## 2. Compose delivery

- [x] 2.1 Add server Dockerfile and build context exclusions for deployment/compose “Single command startup”; verify Node 22 image starts existing migration-first entry with workspace dependencies.
- [x] 2.2 Add client multi-stage Dockerfile and nginx configuration for deployment/compose “Single command startup”; verify bundle, deep-link fallback and HTTP/WebSocket proxy through one origin.
- [x] 2.3 Add production Compose with database health dependency, persistent volume and localhost-only web publication for deployment/compose requirements; verify resolved config has no test entropy setting and no public bindings.
- [x] 2.4 Add ignored env-file pattern, example and deploy README for deployment/compose requirements; execute documented command from clean checkout and verify migrated DB, browser login and volume-preserving restart.

## 3. Deterministic test context

- [x] 3.1 Add one server context generator module and strict process configuration for server/test-entropy requirements; unit/process tests verify valid seed parsing, all non-test refusal cases including empty explicit setting, deterministic sequence and CSPRNG default.
- [x] 3.2 Wire seed source into existing lobby CreateGame and entropy into RoomManager for server/test-entropy “Guarded deterministic context”; verify repeatable full command fixture and unchanged default crypto sources with focused tests and server typecheck.
- [x] 3.3 Add explicit test Compose override and isolated fixture seed for server/test-entropy “Reproducible dice”; verify fresh identical inputs produce third-double jail without mutating game state, and document why restart tests use default CSPRNG.

## 4. Browser evidence

- [x] 4.1 Add Playwright dependency, config and shared browser helper module; verify a real guest login against Compose and retain trace plus sanitized short log, per handoff criterion 2.
- [x] 4.2 Add two/three-context lobby/setup/turn scenarios, including ties and several turns; verify visible order and movement against authoritative events, per effort criteria 1–6 and 11.
- [x] 4.3 Add reload and server-container restart scenarios for deployment/compose “Persistent game storage” and effort criteria 9–10; verify same identity/room and successful post-reconnect command.
- [x] 4.4 Add real-deadline AFK scenario per effort criterion 3; assert auto-roll, same-turn 20 s continuation and subsequent turn closure with trace timestamps.
- [x] 4.5 Add seeded third-double and interim-jail browser scenario for server/test-entropy “Reproducible dice” and effort criteria 4–5; verify jail before movement, streak reset and observable jail continuation.
- [x] 4.6 Add locked-room code/invite, leave/creator-close and resignation-to-game-over scenarios per effort criteria 1a–1c; verify winner screen in independent browser contexts.

## 5. Specs and CI

- [x] 5.1 Correct protocol D5 (RVW-004) and resignation proposal scope (RVW-001); normalize pre-existing strict validation failures without semantic changes, verify each delta with CLI 2.0.0 and inspect diff against accepted contracts.
- [x] 5.2 Read archive skill and archive prerequisite stage 1 changes using CLI 2.0.0 in design dependency order, including merged client-lobby; verify evidence for unchecked tasks and inspect each synced spec diff, then run openspec validate --all --strict.
- [x] 5.3 Add pinned OpenSpec strict validation and Compose Playwright CI job per handoff criteria 3/5a; verify CI executes scenarios and always uploads trace/report/short logs and Compose logs, with no secrets in artifacts.
- [x] 5.4 Add stage 1 delivery to ROADMAP “Сделано” only after evidence exists per handoff criterion 6; verify product text elsewhere is unchanged.

## 6. Integration acceptance

- [x] 6.1 Run clean-checkout production Compose, all browser scenarios, pnpm build, pnpm test, pnpm test:integration, openspec validate --all --strict and git diff --check; record exact commands, SHAs and artifact paths through agentctl.
- [x] 6.2 Inspect acceptance-to-diff mapping, record external intents/results through agentctl, push feature branch and open PR with CI strategy/evidence; obtain independent exact-head review and address valid findings without merging.

## Workflow follow-up

- After accepted merge, archive this change using the archive skill/CLI and coordinate final main green CI evidence with Team Lead; no Engineer merge authority.

## Verification evidence

Node22.23.5/pnpm9.15.9: frozen install, build, unit1372, integration118,
client bundle and browser typecheck pass. Installed/pinned-dlx OpenSpec2.0.0
strict validation:24/24. Full-range diff check passes. Local Playwright1.58.2
production3/3 and isolated seed1036 scenario1/1 pass, with sanitized traces and
scenario logs at `/srv/agents/preview/board-game/evidence/TASK-s1-compose-e2e/`.
Clean clone2f23dc9 on isolated project s1-clean/localhost8082 starts with the
documented command, passes three-browser reload/restart/winner, and full down/up
preserves rooms1/log20/snapshots3. Runtime operation `compose-e2e-clean-checkout`
records this proof. PR22 carries the delivery; exact-head CI/review acceptance
and final-main/post-merge archive remain tracked through agentctl.

CI run43756623846 on03a64a6 passed both ci and compose-browser, including
production and fresh seeded suites plus sanitized evidence upload. Reconnect
proof additionally requires a new Welcome for the same identity after reload
and restart; focused local Chromium rerun passes.

## Post-merge archive and review evidence

PR #22 was merged by the owner at f2386acc88e2b72e234035cd2972a3f516b68fb0
on 2026-11-15. Exact-head CI 43757016257 and main CI 43765659307 (merge),
43765709055 (d604eba) passed both ci and compose-browser. Post-merge independent
review REV-s1-compose-e2e-2 reviewed a5b9558..1622f5e and returned
DECISION_REQUIRED. Team Lead dispositions on 2026-11-15 authorize this follow-up:
RVW-001 query/Referer-free nginx logs with raw pre-sanitization invite check;
RVW-004 one-hour WebSocket read/send timeouts; RVW-005 initial45s deadline
assertion; RVW-002 normalization parity in archived MODIFIED blocks. RVW-003
(real-scenario spec hygiene) is explicitly deferred. Follow-up exact-head CI
and independent review are recorded separately through agentctl; this archive
records the merged delivery and does not claim follow-up merge acceptance.

Archive replay correction RVW-002: four post-sync main-spec normalizations were
copied verbatim into the engine-resignation and server-api archived MODIFIED
blocks (Invariant enforcement, Game phases, Lobby authentication and errors,
Technical nickname rules), preserving all normative text and scenario names.

Follow-up local verification: Node22.23.5/pnpm9.15.9 build, unit1372,
integration118 and browser typecheck pass. CLI strict validation25/25 passes.
Replay proof: extract git archive994ab40, restore all seven final archived
changes as active, run CLI2.0.0 archive --yes in design dependency order;
all25 resulting main specs are byte-identical to the checked-in main-spec tree.
Log: /tmp/s1-followup-replay.log (also copied to durable task evidence).
Local production recovery/winner and AFK scenarios pass; invite passes with
raw web-log query check. The initial nonempty-log assertion was adjusted for
nginx's internal SPA rewrite to /index.html. Raw new-stack logs contain zero
code= markers before sanitization; original-stack logs contain three, proving
the detector distinguishes the pre-fix configuration. Evidence:
/srv/agents/preview/board-game/evidence/TASK-s1-compose-e2e/followup/.
