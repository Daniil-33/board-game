# Deploy staging and production: Team Lead technical design

Effort: `EFF-deploy-staging-production`, handoff
`docs/efforts/deploy-staging-production.md` revision 1, accepted by the Team
Lead on 2026-11-16 at main `78478c6`. Numbered criteria (C1..C11) refer to
the handoff. This document holds only the decisions delegated to the Team
Lead; it changes no game rule.

## Facts checked on the VPS (2026-11-16)

- DNS: `focusima.space`, `api.`, `stage.`, `stage-api.` resolve to
  149.5.209.208 from the VPS.
- Ports 80 and 443 are free; sshd listens on 22.
- The `agents` user reaches Docker through the `docker` group (`sg docker`
  in non-login shells); no sudo.
- 6 CPU, 7.5 GB RAM, 81 GB free disk. Running today: owner preview
  (`preview`, 127.0.0.1:5173), Engineer test stacks, the speech service.
- `main` has no branch protection; the agent account is a repository admin
  (can create environments and secrets).

## Delegated decisions

| Decision | Choice | Why |
|---|---|---|
| Reverse proxy | One shared `edge` Compose project: `nginx:1.27-alpine` on 0.0.0.0:80/443 | Single TLS terminator for four hosts; only the proxy is public. |
| Certificates | `certbot/certbot` container, HTTP-01 **webroot** challenge through the edge nginx, one certificate per environment (SAN pair) | No DNS API needed; ports 80/443 are free. |
| Renewal | certbot container loops `certbot renew` every 12 h; the nginx container reloads itself every 6 h (`nginx -s reload` loop) | Automatic renewal and pickup without host cron or root. |
| Edge -> app routing | External Docker networks `edge-staging` and `edge-production`; each environment's `web` and `server` join only its own network; nginx proxies by host name to the service DNS name | Postgres is never published or attached to the edge; environments cannot reach each other. |
| Environment stacks | Compose projects `game-staging` and `game-production` from one file `deploy/app/compose.yml`, env file `/srv/agents/game/<env>/env` (outside Git, mode 600) | Separate DB, volumes, secrets (C3); no ports published. |
| Image build | On the server, from a per-environment checkout `/srv/agents/game/<env>/src` at the target SHA | No registry account or credentials (reserved decisions avoided). |
| Per-environment API host | Client: runtime config `/config.js` written by the web container entrypoint from `API_ORIGIN`; empty means same-origin (local Compose and e2e unchanged). Server: `ALLOWED_ORIGINS` (comma list) enables CORS on `/api/*` (Authorization header, no cookies) and rejects WebSocket upgrades from other origins; unset keeps today's same-origin behaviour | One image per commit for both environments; C1 origins enforced. |
| Version visibility | Build arg `GIT_SHA`: server `GET /api/health` -> `{ "status": "ok", "sha": … }`; client `/version.txt` | Health check and the evidence "serves the current main SHA". |
| Deploy entry | `authorized_keys` forced command `/srv/agents/game/bin/deploy-gate` with `restrict` (no pty, forwarding, agent, X11, user rc). The gate accepts only `deploy <staging\|production> <40-hex sha>` from `SSH_ORIGINAL_COMMAND`, takes a per-environment lock, and runs `deploy/deploy.sh` from the checkout at that SHA | C6; the gate is tiny and installed once; deploy logic is reviewed in PRs. |
| Commit admission | The gate fetches `origin` and requires the SHA to be reachable from `origin/main`. Production also requires that SHA in `/srv/agents/game/staging/deployed.log` (successful staging deploys) | C5 "a commit already running on staging", enforced server-side as well as by the workflow. |
| Deploy steps | checkout SHA -> `compose build` with `GIT_SHA` -> `compose up -d --wait` (server applies migrations before listening, as today) -> public HTTPS health check (`/api/health` sha equals target, `/version.txt` equals target, WebSocket upgrade from the allowed origin succeeds) -> append to `deployed.log`. Any failure exits non-zero with a clear message | C7; idempotent (same SHA = cached build, no-op up). |
| Rollback | Re-run the deploy with the previous SHA (staging: manual dispatch; production: the same owner-approved workflow). Forward-only migrations: rolling back across a migration is documented as unsupported | C7. |
| Workflows | `deploy-staging.yml`: `workflow_run` of `CI` completed with success on a push to `main` -> environment `staging` -> SSH `deploy staging <head_sha>`; also `workflow_dispatch` (sha input) for rollback. `deploy-production.yml`: `workflow_dispatch` (sha input, default = the SHA staging runs, read from `/api/health`), environment `production` with required reviewer `Daniil-33`, self-review prevention on. Concurrency group per environment, never cancel in progress | C4, C5. |
| SSH material in GitHub | Environment secrets `DEPLOY_SSH_KEY` (ed25519, generated on the VPS, private part uploaded with `gh secret set` from a file and then deleted locally) and `DEPLOY_KNOWN_HOSTS` (the VPS host key line, pinned; `StrictHostKeyChecking yes`) | C6, C9. One key per environment so production can be revoked separately. |
| Secrets | `/srv/agents/game/<env>/env` holds `POSTGRES_PASSWORD` (random, generated on the server) and non-secret settings; workflows never `cat` or echo it; deploy output redacts nothing because it prints no env values | C9. |
| Resource limits | edge 0.5 CPU / 256 MB; per environment: server 1 CPU / 768 MB, db 1 CPU / 768 MB, web 0.25 / 128 MB | Two environments plus preview and test stacks fit 6 CPU / 7.5 GB. |
| CI headroom (C10) | `compose-browser` split into two jobs: `compose-browser` (production-stack specs) and `compose-browser-seeded` (deterministic stack), each with timeout 35 min; Playwright browsers cached. The staging deploy waits for the whole `CI` workflow, so both jobs gate it | Roughly halves wall time and gives each job more than 2x headroom; no branch protection depends on job names. |
| Preview and test stacks | Unchanged: they bind 127.0.0.1 only and use other project names | Handoff constraint. |

## Security notes

- Public surface: 80 (ACME + redirect) and 443 only. Postgres and the app
  containers publish no host ports in staging/production.
- The deploy key can only run the gate; the gate never passes the argument to
  a shell (`case` on a strict regex, then exec with fixed argv).
- Anyone who can merge to `main` can change `deploy.sh`; that is the existing
  trust boundary (review + CI). The gate itself changes only through a
  recorded operation.
- The production workflow cannot be approved by agents: the required reviewer
  is the owner only, and agents never approve deployments (C5).

## Tasks and order

```
TASK-dep-config (server+client config, health/version)  ─┐
TASK-dep-stack (edge, app compose, gate, deploy.sh,       ├─> TASK-dep-pipeline (workflows, GitHub
  runbook, spec, staging+edge server setup)              ─┘     environments/secrets, CI split, evidence)
```

- `TASK-dep-config` and `TASK-dep-stack` run in parallel. The stack task's
  health check uses `/api/health` and `/version.txt`; until config merges, its
  local verification may stub them, and its first real staging deploy happens
  after config merges.
- `TASK-dep-pipeline` starts after both merge.
- At most two Engineers at once.

## Server-side operations (recorded with `agentctl operation`)

Performed once, each with intent -> perform -> verify -> confirm, and listed in
the runbook:

1. Create `/srv/agents/game/{bin,staging,production}`, env files (mode 600) with
   generated passwords (stack task).
2. Install `/srv/agents/game/bin/deploy-gate` from the merged `main` (stack task).
3. Create networks `edge-staging`, `edge-production`; start `edge`; issue the
   two certificates (stack task).
4. Generate the per-environment deploy keys, add `authorized_keys` entries
   with the forced command, upload secrets, create GitHub environments and
   protection (pipeline task).
5. First staging deploy through the workflow (pipeline task). Production:
   environment and certificates only; no deploy without owner approval.

## Evidence plan

Per task: green CI on the exact head, independent review, focused checks.
Effort completion (handoff list): `https://stage.focusima.space` shows the
current main SHA (`/version.txt`, `/api/health`) with a valid certificate;
two browsers play setup and a turn through `stage-api` over WSS; a workflow
run link of an automatic staging deploy; a failing health check fails the
workflow (dry run against a deliberately wrong expected SHA); the production
run waiting for the owner (API output of the environment protection); valid
TLS on `focusima.space` and `api.focusima.space`; an SSH attempt with the
deploy key running another command is refused; CI timings with headroom;
runbook merged; `openspec validate --all --strict`; green CI on final `main`.
