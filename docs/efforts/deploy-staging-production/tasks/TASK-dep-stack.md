# Team Lead -> Engineer Task Handoff

```yaml
id: TASK-dep-stack
revision: 1
effort: EFF-deploy-staging-production
project: economic-board-game
source_commit: 78478c6 # main with the effort handoff
owner: team-lead
status: proposed
```

## Outcome

The repository contains the production deployment stack (TLS edge proxy with
certbot, per-environment app Compose file, deploy gate and deploy script, a
runbook and the deployment spec), and the VPS runs the edge with valid
certificates for all four hosts and a prepared staging and production layout.

## Acceptance criteria

Repository (`deploy/**`, runbook, spec):

1. `deploy/edge/`: Compose project `edge` with `nginx:1.27-alpine` on
   0.0.0.0:80/443 and `certbot/certbot`. Port 80 serves
   `/.well-known/acme-challenge/` from a shared webroot and redirects
   everything else to HTTPS. 443 serves:
   - `stage.focusima.space` -> `game-staging` `web`;
     `stage-api.focusima.space` -> `game-staging` `server` (`/api/`, `/ws`
     with upgrade and 1 h timeouts);
   - `focusima.space` -> `game-production` `web`; `api.focusima.space` ->
     `game-production` `server`.
   Upstreams are resolved at request time (Docker resolver + variables) so
   nginx starts and serves TLS while an environment is not running (502 or a
   short maintenance page). HSTS on; access logs keep request paths only (no
   query strings), as the client container does today.
2. Bootstrap without certificates: nginx starts with HTTP only until the
   certificate files exist (entrypoint or include switch), so the first
   issuance works; documented and scripted (`deploy/edge/issue-certs.sh`).
3. Renewal: certbot renews every 12 h (`certbot renew` loop); nginx reloads
   periodically (every 6 h) so renewed certificates are used without manual
   steps (C2). One certificate per environment: (`focusima.space`,
   `api.focusima.space`) and (`stage.focusima.space`,
   `stage-api.focusima.space`); Let's Encrypt staging CA used for first dry
   runs to avoid rate limits.
4. `deploy/app/compose.yml`: db/server/web for one environment, used with
   `-p game-staging` / `-p game-production` and `--env-file
   /srv/agents/game/<env>/env`; no published ports; `server` and `web` join the
   external network `edge-<env>` (db stays on the internal network only);
   named volumes per project; resource limits from the design; `GIT_SHA`
   build arg; `ALLOWED_ORIGINS` and `API_ORIGIN` from the env file;
   `restart: unless-stopped`.
5. `deploy/deploy-gate` (installed to `/srv/agents/game/bin/deploy-gate`): reads
   `SSH_ORIGINAL_COMMAND`, accepts only `deploy (staging|production)
   <40 lowercase hex>`, refuses anything else with exit 2 and a one-line
   message; never evaluates input in a shell; per-environment `flock`;
   fetches `origin` in `/srv/agents/game/<env>/src`, requires the SHA reachable from
   `origin/main`; for production requires the SHA in
   `/srv/agents/game/staging/deployed.log`; checks out the SHA detached and execs
   `deploy/deploy.sh <env> <sha>` from it. Docker access through the docker
   group (`sg docker` or equivalent) works in the forced-command context.
6. `deploy/deploy.sh <env> <sha>`: build with `GIT_SHA`, `up -d --wait
   --remove-orphans`, then the public health check over HTTPS:
   `/api/health` sha == target, `/version.txt` == target, a WebSocket upgrade
   to `wss://<api host>/ws` with the environment's `Origin` succeeds (101)
   and one with a foreign `Origin` is refused. On success append
   `<utc> <sha>` to `/srv/agents/game/<env>/deployed.log`; on any failure exit
   non-zero with a clear message and print recent `server` logs (never the
   env file). Idempotent for the same SHA. Never prints secrets.
7. Tests for the gate and the deploy health logic that run in CI without the
   VPS (e.g. bats or a node/shell test with fakes for git/docker/curl):
   refused commands (shell metacharacters, wrong env, short sha, extra args),
   production SHA not on staging refused, unhealthy health check fails with
   non-zero exit. `shellcheck` clean.
8. `docs/deployment.md` runbook: hosts, architecture, first-time server
   setup (every operation below, in order), deploy, rollback (redeploy of the
   previous SHA; forward-only migrations caveat), certificate issue and
   renewal, where secrets live (`/srv/agents/game/<env>/env`, GitHub environment
   secrets) and how to rotate them, coexistence with the owner preview and
   Engineer test stacks, resource limits, known risks (no backups, open
   staging).
9. `openspec/specs/deployment` delta: public edge on 80/443 only, per
   environment isolation, deploy gate contract, health check, renewal. The
   existing "localhost only" requirement stays true for the local stack.

On the VPS (each step `agentctl operation intend` -> perform once -> verify
-> `mark confirmed`; never repeat blindly):

10. `/srv/agents/game/{bin,staging,production}` created; env files mode 600 with
    generated `POSTGRES_PASSWORD` and the environment's `ALLOWED_ORIGINS`,
    `API_ORIGIN`, public hosts; checkouts `/srv/agents/game/<env>/src` cloned
    read-only from GitHub over HTTPS (public repo; no credentials stored).
11. Networks `edge-staging`, `edge-production` created; `edge` started from
    the merged `main`; certificates issued for both environments (production
    CA after a successful staging-CA dry run); `curl -sI` shows valid
    certificates and the HTTP->HTTPS redirect for all four hosts.
12. `deploy-gate` installed from the merged `main` and exercised locally
    (`SSH_ORIGINAL_COMMAND=... /srv/agents/game/bin/deploy-gate`): a first manual
    staging deploy of a `main` SHA that includes `TASK-dep-config` passes the
    health check. Production: layout and certificates only, **no deploy**.

## Scope and non-goals

In scope: `deploy/**`, `docs/deployment.md`, OpenSpec deployment delta,
tests and their CI wiring (a small added step in `ci` is allowed), the VPS
operations above.

Not in scope: server/client code (TASK-dep-config); GitHub workflows,
environments, SSH keys and `authorized_keys` (TASK-dep-pipeline); the
`compose-browser` job; monitoring, backups (stage 8). The owner preview and
Engineer stacks must keep working.

## Canonical references

- `docs/efforts/deploy-staging-production.md` revision 1.
- `docs/efforts/deploy-staging-production/design.md`.
- `openspec/config.yaml`, `openspec/specs/deployment/*`, existing
  `docker-compose.yml` and `apps/client/nginx.conf`.

## Constraints and invariants

No sudo or host changes needing root; everything in containers or in the
`agents` home/`/srv/agents/game`. Postgres never public. Secrets never in Git,
checkpoints, workflow logs or PR text. Only the four hosts are served.
No production deploy and no production traffic without owner approval.

## Dependencies

Parallel with `TASK-dep-config`; uses its names (`ALLOWED_ORIGINS`,
`API_ORIGIN`, `GIT_SHA`, `/api/health`, `/version.txt`). The PR can merge
before config; criterion 12 (first real staging deploy) waits for the config
merge. `TASK-dep-pipeline` starts after this merges.

## Delegated decisions

File layout under `deploy/`, test framework for scripts, maintenance page,
exact nginx tuning, certbot invocation details. Return to the Team Lead
before exposing any other port, adding an external service or account, or
changing the gate command contract.

## Required workflow

Explore -> Propose (OpenSpec change, proposal checkpoint reported with
`agentctl engineer report --wake`) -> Team Lead approval -> Apply -> Verify ->
PR -> start the independent review yourself (`agentctl review start`) ->
review fixes -> merge by the Team Lead -> VPS operations 10-12 from merged
`main` -> report with evidence. Archive the OpenSpec change in the PR once
review passes.

## Required checks

Script tests, `shellcheck`, `docker compose config` for edge and app files,
`openspec validate --all --strict`, `git diff --check`, green CI on the PR
head; operation records confirmed for 10-12.

## Escalation conditions

Ports 80/443 unavailable; certificate issuance failing; Docker access not
working in the forced-command context; any need for root.

## Deliverables

OpenSpec change, `deploy/**`, runbook, tests, branch `agent/task-dep-stack`,
PR, CI evidence, independent review report, operation records, TLS and
health evidence in `/srv/agents/evidence/TASK-dep-stack/` (no secrets),
residual risks.

The Engineer accepts the exact revision before editing. A material change
creates a new revision.
