# Tasks

## 1. Apply prerequisites

- [x] 1.1 In fresh context verify Team Lead proposal acceptance and client-lobby merge confirmation, update branch from current main, reread merged client/server contracts and review references; record exact SHAs through agentctl before code edits.

## 2. Compose delivery

- [x] 2.1 Add server Dockerfile and build context exclusions for deployment/compose “Single command startup”; verify Node 22 image starts existing migration-first entry with workspace dependencies.
- [x] 2.2 Add client multi-stage Dockerfile and nginx configuration for deployment/compose “Single command startup”; verify bundle, deep-link fallback and HTTP/WebSocket proxy through one origin.
- [x] 2.3 Add production Compose with database health dependency, persistent volume and localhost-only web publication for deployment/compose requirements; verify resolved config has no test entropy setting and no public bindings.
- [ ] 2.4 Add ignored env-file pattern, example and deploy README for deployment/compose requirements; execute documented command from clean checkout and verify migrated DB, browser login and volume-preserving restart.

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
- [ ] 5.3 Add pinned OpenSpec strict validation and Compose Playwright CI job per handoff criteria 3/5a; verify CI executes scenarios and always uploads trace/report/short logs and Compose logs, with no secrets in artifacts.
- [x] 5.4 Add stage 1 delivery to ROADMAP “Сделано” only after evidence exists per handoff criterion 6; verify product text elsewhere is unchanged.

## 6. Integration acceptance

- [ ] 6.1 Run clean-checkout production Compose, all browser scenarios, pnpm build, pnpm test, pnpm test:integration, openspec validate --all --strict and git diff --check; record exact commands, SHAs and artifact paths through agentctl.
- [ ] 6.2 Inspect acceptance-to-diff mapping, record external intents/results through agentctl, push feature branch and open PR with CI strategy/evidence; obtain independent exact-head review and address valid findings without merging.

## Workflow follow-up

- After accepted merge, archive this change using the archive skill/CLI and coordinate final main green CI evidence with Team Lead; no Engineer merge authority.
