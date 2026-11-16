# Design

## Context

Base 78478c6 has a local Compose stack, nginx client proxy and CI, with no public deployment scripts. See proposal.md for motivation. The authoritative design and task handoff live in the TL-deploy-design worktree under docs/efforts/deploy-staging-production. This change implements their decisions, without app code changes.

## Goals / Non-Goals

**Goals:** A reviewable, offline-testable deployment stack and recorded post-merge provisioning, satisfying TASK-dep-stack revision 1.

**Non-Goals:** New infrastructure services, host root changes, production app startup, changes to existing preview/test stacks, and application or pipeline task ownership.

## Decisions

1. **Edge configuration:** deploy/edge/compose.yml uses nginx:1.27-alpine plus certbot/certbot, shared challenge and certificate volumes, and both external edge networks. An entrypoint renders HTTP-only configuration initially and enables each environment's TLS blocks only when its certificate pair exists. Unknown hosts are rejected. After issuance, issue-certs.sh triggers config regeneration/reload; the six-hour loop also regenerates before reload. This avoids a self-signed bootstrap certificate and preserves the other environment during issuance.
2. **Routing:** nginx Docker resolver with variable upstreams avoids startup DNS failures. Use distinct per-environment network aliases (staging-web, staging-server, production-web, production-server), since generic service aliases on both edge networks are ambiguous. No fixed container IPs. Keep query-free access logs, HSTS and explicit API/WebSocket locations. Mount certificate files read-only in nginx.
3. **Certificate issuance:** issue-certs.sh performs a staging-CA dry run using isolated temporary certbot state before production issuance into persistent certificate storage. Never replace live certificates with staging-CA certificates. No email/account requirement is invented: use certbot's supported registration without email and document the absence of expiry email. Renewal loop is 12 h; nginx reload loop is 6 h, with signals handled and nginx kept as a supervised foreground process.
4. **App Compose:** deploy/app/compose.yml resolves build contexts to repository root. Internal DB network plus separate application edge network selected by environment. Set accepted resource limits: server 1 CPU/768 MB, db 1 CPU/768 MB, web 0.25 CPU/128 MB; nginx 0.5 CPU/256 MB. Pass GIT_SHA as build arg, runtime origins from env file, use restart unless-stopped, no published ports. Keep existing local Compose untouched.
5. **Gate and locking:** implement the gate as a small Python 3 executable using full-match validation, subprocess argv and fcntl.flock (equivalent flock semantics). Fixed /srv/game paths; no shell eval or sourced environment. Fetch the main remote tracking ref, validate ancestry, check production staging log by exact SHA field, then detached checkout. Preserve lock across exec into deploy.sh. Re-exec through sg docker with a fixed command before processing untrusted input when Docker group membership is absent; SSH_ORIGINAL_COMMAND remains data. Python avoids shell parsing hazards without adding a package dependency.
6. **Deployment and health:** deploy.sh validates arguments and env-file ownership/permissions, uses explicit Compose project/file/env-file arguments, exports target GIT_SHA and runs build then up --wait --remove-orphans. A separate Python stdlib health helper verifies HTTPS JSON and client SHA plus raw TLS WebSocket handshake headers (valid upgrade semantics and origin rejection). Bounded retries allow startup propagation; no TLS verification bypass. Failure prints a clear message and bounded server logs, never config/environment. Append only after all checks; same-SHA redeployment may append another success event.
7. **Tests:** Python unittest with temporary fake executables and filesystem fixtures exercises gate grammar, ancestry, production admission, lock preservation and Docker group path without VPS access. Health tests use fake HTTP/TLS responses and execute deploy.sh against fake Docker/health commands to prove failures propagate without success logging. Test seams are local imports or test fixtures, never attacker-controlled SSH path overrides. Shellcheck covers every shell script; minimal ci step runs script tests and shellcheck, leaving compose-browser alone. Compose config uses dummy nonsecret env values.

## Risks / Trade-offs

- Shared edge is a single point of failure → validate configuration before reload and preserve running apps during setup.
- No backups and open staging → document accepted stage-8 risks; production remains empty.
- Build resource contention → accepted service limits and serialized per-environment deploys; no extra services.
- ACME/DNS or unavailable ports → verify before operation; escalate failures instead of changing hosts or privileges.
- Python 3 is a host prerequisite → verify before installation and document it; it is already available in this Engineer environment.
- Forward-only migrations → rollback only across compatible schema; do not promise automatic database rollback.

## Migration Plan

After approval implement and verify locally, open a PR, start independent review via agentctl and resolve findings. Archive the OpenSpec change after review passes in the PR. Team Lead merges; do not merge as Engineer. Only then provision /srv/game layouts and secret env files, public read-only HTTPS checkouts, install the gate, create networks and start edge from merged main. Record each external mutation with agentctl intent/perform/verify/confirm. Issue certificates using staging CA first and verify redirects/TLS for all four hosts. Wait for TASK-dep-config merge before first manual staging gate deployment and health evidence. Keep production app stopped. Evidence goes under /srv/agents/evidence/TASK-dep-stack with no secrets. Rollback redeploys a previously successful compatible main SHA.

## Apply notes from Team Lead approval

The gate cleanly refuses a target without executable deploy/deploy.sh (exit 2, one line), covered offline. Initial provisioning uses check-hairpin.sh before live ACME: a temporary locally trusted test certificate proves direct VPS-to-public-IP HTTPS and cleanup restores HTTP-only mode; failure escalates to the Team Lead without root or /etc/hosts changes. The isolated staging-CA run remains mandatory before live issuance; no-email registration is documented. The edge owns nginx.conf to avoid the stock image combined access log running alongside the path-only log.
