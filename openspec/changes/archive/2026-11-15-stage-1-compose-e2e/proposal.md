# Proposal

## Why

Stage 1 has individual layers but no deployable, browser-proven Compose stack. TASK-s1-compose-e2e closes effort revision 3 with localhost deployment and repeatable recovery, timeout and game completion evidence.

## What Changes

- Build the client and run server, web proxy and persistent Postgres with one documented Compose command; publish only localhost ports.
- Add guarded test-only deterministic entropy and real multi-context Playwright scenarios with trace/video and short logs in CI.
- Normalize legacy OpenSpec formatting, correct RVW-004 protocol D5 and RVW-001 resignation scope wording, and archive stage 1 changes through CLI 2.0.0 in dependency order.
- Add strict OpenSpec validation to CI and update only ROADMAP.md “Сделано” after delivery evidence exists.

Out of scope: new rules, product bug fixes, public exposure, TLS, production hardening, load tests, economics and final jail mechanics. GAME-BREAKDOWN.md sections “Порядок ходов, ход и кости” and “Принятые технические границы и текущая реализация” govern; stage 1 owner decisions in ROADMAP and effort revision 3 govern the interim jail implementation.

## Capabilities

### New Capabilities

- `deployment/compose`: single-command localhost stack with migration, persistent storage and client delivery.
- `server/test-entropy`: explicit test-only deterministic entropy with fail-closed environment guard.

### Modified Capabilities

None. Existing game contracts are exercised and synchronized without changing their behavior.

## Impact

Dockerfiles, Compose and proxy configuration, server entry configuration/context wiring, Playwright dev dependency and scenarios, CI, deploy README, stage 1 OpenSpec artifacts and ROADMAP completion list. No protocol or core behavior changes. Apply requires Team Lead approval, confirmed client-lobby merge and a fresh Engineer context.
