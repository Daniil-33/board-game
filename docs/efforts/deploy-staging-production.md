# CTO -> Team Lead Effort Handoff

```yaml
id: EFF-deploy-staging-production
revision: 1
project: economic-board-game
repo: github.com/Daniil-33/board-game
created_at: 2026-11-16T11:45:00Z
source_commit: 37774f4 # plus the docs PR that adds this file
owner: cto
status: proposed
```

## Outcome

The game runs on public HTTPS addresses of the owner's domain
`focusima.space`: staging is updated automatically from `main` after green CI,
production is updated only after the owner approves it in GitHub. Both run on
the current VPS (149.5.209.208). This is infrastructure work between roadmap
stages 3 and 4; it changes no game rule.

## Expected behavior and acceptance criteria

Agreed with the owner on 2026-11-16 (CTO chat and voice evidence below).

1. Hostnames (DNS A records already point to 149.5.209.208):
   - staging: `stage.focusima.space` (web client), `stage-api.focusima.space`
     (server HTTP and WebSocket);
   - production: `focusima.space` (web client), `api.focusima.space` (server
     HTTP and WebSocket).
   Each web client talks to the API host of its own environment; the server
   accepts browser origins of its own environment only.
2. TLS: Let's Encrypt certificates issued and renewed with certbot (owner
   decision) for all four hostnames; HTTP redirects to HTTPS; renewal is
   automatic and reloads the proxy without manual steps.
3. Staging and production are separate Compose projects with separate
   databases, volumes and secrets. Production data persists across deploys;
   database migrations run as part of a deploy.
4. Staging deploy: after CI (`ci` and `compose-browser`) succeeds on a push to
   `main`, a GitHub Actions workflow deploys exactly that commit to staging.
5. Production deploy: the same mechanism behind a GitHub environment
   `production` whose required reviewer is the owner (`Daniil-33`). It
   deploys a commit that is already running on staging. Agents never approve
   production deployments.
6. Deploy transport: SSH with a dedicated key stored in GitHub secrets; the
   server host key is pinned in the workflow. On the server the key is
   restricted to the deploy command only (forced command, no shell, no pty,
   no forwarding); the command accepts only an environment name and a commit
   SHA.
7. A deploy is idempotent, runs a health check afterwards, and fails the
   workflow visibly if the new version is unhealthy. Rollback is a redeploy of
   the previous SHA and is documented.
8. Staging is open to everyone without a password (owner decision, accepting
   that stage 8 protections are still deferred). Production infrastructure is
   prepared; the first production deploy happens only when the owner
   approves it.
9. Secrets (database passwords and similar) live in server-side environment
   files outside Git and are never printed in workflow logs. GitHub holds only
   the SSH key and host key.
10. CI headroom: the `compose-browser` job (about 14.5 of its 20 min timeout
    after stage 3) gets enough headroom for stages 4-8: raise the timeout
    and/or shard the browser specs (Team Lead report 2026-11-16).
11. A deployment runbook in the repository describes hosts, first-time server
    setup, deploy, rollback, certificate renewal and where secrets live; the
    `openspec/specs/deployment` spec matches the result.

## Scope and non-goals

In scope: reverse proxy and certbot, production-grade Compose configuration,
deploy script, GitHub Actions workflows and environment, server-side key
restriction, CI timeout/sharding, runbook and deployment spec, any small
server/client configuration needed for per-environment origins and API hosts.

Not in scope: game rules; a separate production server; monitoring,
alerting, log aggregation and database backups (stage 8 "Эксплуатация",
named as a risk below); load testing; the stage 8 hardening items (rate
limits, token lifetime).

## Canonical sources

- `ROADMAP.md` "Технические решения" (Docker Compose, single node) and stage 8
  "Эксплуатация".
- `openspec/config.yaml`, `openspec/specs/deployment/*`.
- Existing `docker-compose` files, `.github/workflows/ci.yml`.
- Owner decisions 2026-11-16 (runtime decisions log): domain and hosts, TLS via
  certbot, open staging, SSH deploy key, production by owner approval.
- Owner voice evidence:
  `/srv/agent-runtime/state/inbox/VOICE-20261116T111745979835Z-3562e9/transcript.txt`.

## Architecture constraints

- Single node, Docker Compose, no new hosted services or paid products.
- The `agents` Unix user has Docker access but no sudo: the proxy and certbot
  must run in containers (ports 80/443 are free); host-level changes that need
  root are not available. The restricted deploy key is installed in the
  `agents` user's `authorized_keys` with a forced command.
- Server-side changes outside the repository (authorized_keys entry, env
  files, Compose projects) are listed in the runbook and performed once as
  recorded operations (`agentctl operation`), never repeated blindly.
- The existing owner preview (Compose project `preview`, 127.0.0.1:5173) and
  Engineer test stacks must keep working or be retired explicitly in the
  runbook with CTO agreement.
- Container resource limits keep staging, production, preview and Engineer
  test stacks within the VPS (6 CPU, 7 GB RAM).

## Delegated and reserved decisions

Team Lead decides: proxy choice (nginx or similar) and certbot challenge
method, Compose layout, image build location (on server or GHCR), deploy
script design, workflow structure, sharding strategy, configuration format
for origins and API hosts, task order.

Reserved (escalate via CTO): any new paid service or external account; any
change that exposes Postgres or other internal ports publicly; serving the
game from hosts other than the four above; enabling production traffic
without owner approval.

## Dependencies, risks, and limits

- Public resolvers may still serve stale records for `stage` and `stage-api`
  for a short time after 2026-11-16 11:30Z; the authoritative servers are
  correct.
- Risk: no database backups yet; production stays empty until the owner
  approves the first deploy, and backups are a stage 8 item.
- Risk: the open staging is reachable by anyone; deferred stage 1 items
  (access-code rate limit, guest token lifetime) remain open.
- VM agents work only on branches with PRs; never push to `main`. Routine PRs
  merge after independent review and green CI.

## Required Team Lead output

Technical design (proxy and TLS, Compose layout per environment, deploy flow
and its security, workflows and environment protection, CI headroom), task
decomposition, integration plan, evidence plan, focused escalations.

## Completion evidence

- `https://stage.focusima.space` serves the client of the current `main` SHA
  with a valid certificate; two browsers play setup and a turn through
  `stage-api.focusima.space` (WebSocket over TLS).
- A merge to `main` deploys to staging automatically (workflow run link); an
  unhealthy deploy fails visibly in a test or dry run.
- The production workflow waits for owner approval (screenshot or API output
  of the environment protection); TLS for `focusima.space` and
  `api.focusima.space` is valid.
- The deploy key cannot open a shell on the server (evidence of the forced
  command refusing other commands).
- `compose-browser` CI has documented headroom; CI green on the final `main`.
- Runbook merged; `openspec validate --all --strict` passes.

## Revision history

- 1: initial handoff.

## Acceptance

The Team Lead records acceptance of this exact revision or returns exact gaps.
A material change creates a new revision.
