# Public deployment

The shared `edge` Compose project terminates HTTPS on the current VPS
(149.5.209.208). Only nginx publishes ports: 0.0.0.0:80 and :443.

| Environment | Web | API / WebSocket | Compose project |
| --- | --- | --- | --- |
| staging | stage.focusima.space | stage-api.focusima.space | game-staging |
| production | focusima.space | api.focusima.space | game-production |

Each app project has its own database volume and internal database network.
Only web and server join its external `edge-staging` or `edge-production`
network. The shared edge uses distinct `staging-web`, `staging-server`,
`production-web`, `production-server` DNS aliases; missing apps return 502
without preventing TLS startup. HTTP serves ACME challenges and redirects
other paths to HTTPS. Unknown hosts are refused. TLS has HSTS. Access logs
contain paths without query strings; edge error logging is limited to critical
errors because ordinary proxy errors can include credential-bearing queries.
The existing root `docker-compose.yml` remains the localhost-only local stack.

## Ordered first-time setup

An Engineer provisions **only after the Team Lead merges the reviewed stack
PR**. The first staging app deploy also requires TASK-dep-config on `main`.
Production receives directories, secrets and certificates only: **do not start
its app without owner approval**. Do not change host files, use sudo, or stop
other stacks. A failure of ports, DNS, ACME, Docker group access or the public
HTTPS path is an escalation to the Team Lead, never a reason to bypass TLS.

Every external operation follows intent -> perform once -> verify -> confirmed:

```sh
agentctl operation intend --id <unique-id> --task TASK-dep-stack --kind <kind> \
  --identity '<exact target and action>' --reconcile '<read-only verification>'
# Perform the recorded action once, then verify its external state.
agentctl operation mark <unique-id> confirmed --observed '<concrete evidence>'
```

If an operation times out, record `unknown`, reconcile external state before
retrying, and never copy secrets into evidence. Save nonsecret results under
`/srv/agents/evidence/TASK-dep-stack/`. Record each numbered mutation below
separately (including certificate issuance and first staging deploy).

1. Verify prerequisites without changes: Python 3, Git, `sg`, Docker Compose
   v2, `openssl`, `curl`, writable `/srv/agents/game`, all four DNS A records pointing
   to 149.5.209.208, and ports 80/443 free. Check current `docker ps` so the
   owner `preview` (127.0.0.1:5173), speech service and Engineer stacks are
   preserved. Docker commands on this VPS run through `sg docker -c '…'`.
   Do not publish any additional port.
2. Create `/srv/agents/game/{bin,edge,staging,production}` as `agents`. Clone the public
   repository into `/srv/agents/game/edge/src` and each `/srv/agents/game/<env>/src` using
   `git clone https://github.com/Daniil-33/board-game.git <path>` and fetch
   `origin/main`. These checkouts store no Git credentials; use only public
   HTTPS fetches and do not configure push credentials. Check out merged main
   detached. Pin the edge checkout to a chosen full merged main SHA and record
   it in the setup operation; never use a staging checkout for edge mounts.
   Verify remote URL and SHA without dumping configuration secrets.
3. Generate each env file once, never overwrite an existing one blindly. Use
   this Python snippet as `agents`; it creates files with exclusive mode 600
   and prints no password. The hex password is safe in the database URL.

   ```python
   import os, secrets
   for env, web, api in (
       ('staging', 'stage.focusima.space', 'stage-api.focusima.space'),
       ('production', 'focusima.space', 'api.focusima.space'),
   ):
       path = f'/srv/agents/game/{env}/env'
       fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
       with os.fdopen(fd, 'w') as file:
           file.write(f'POSTGRES_PASSWORD={secrets.token_hex(32)}\n'
                      f'DEPLOY_ENV={env}\nALLOWED_ORIGINS=https://{web}\n'
                      f'API_ORIGIN=https://{api}\nWEB_HOST={web}\nAPI_HOST={api}\n')
   ```

   Verify owner and mode using `stat`, never `cat`. Do not commit env files or
   include rendered Compose configs with real passwords in logs/evidence.
4. Install the gate from the merged main checkout with
   `install -m 755 /srv/agents/game/staging/src/deploy/deploy-gate /srv/agents/game/bin/deploy-gate`.
   Verify its checksum against that checkout. The host needs Python 3. An SSH
   forced-command shell may lack active Docker group membership; the gate
   re-execs through `sg docker -c /srv/agents/game/bin/deploy-gate` with a **fixed**
   command, preserving `SSH_ORIGINAL_COMMAND` as data. Test a refused command
   locally: `SSH_ORIGINAL_COMMAND=id /srv/agents/game/bin/deploy-gate` must return 2
   with one line. Key creation and `authorized_keys` changes belong to
   TASK-dep-pipeline, not this setup.
5. Create networks `edge-staging` and `edge-production` after inspecting
   whether they already exist. From `/srv/agents/game/edge/src/deploy/edge`, start
   `sg docker -c 'docker compose -p edge -f compose.yml up -d'`. With no
   certificates, nginx starts HTTP only. Verify a temporary public challenge
   file for all four hosts and remove it after testing. Inspect edge logs and
   container status. Do not touch preview or Engineer project networks.
6. **Verify VPS -> own public IP HTTPS (hairpin) early, before live ACME.**
   From the edge directory run `sg docker -c 'sh check-hairpin.sh'`. This
   initial-only check refuses to run if live certificates already exist. It
   temporarily loads a one-day self-signed certificate into nginx's `/tmp`,
   then verifies HTTPS from the VPS through 149.5.209.208:443 using `curl
   --cacert` with that exact temporary certificate and `--resolve` for the
   accepted staging hostname. This tests routing and TLS without a trust
   bypass, external account, root access or `/etc/hosts` changes. Cleanup
   restores the HTTP-only config and removes the temporary certificate/key.
   A 502 response is expected because apps are absent. On connection/routing
   failure, stop and escalate to the Team Lead before live issuance; do not
   work around the network path. Record the test and cleanup as an operation.
   After live issuance repeat normal system-trusted HTTPS on all four names.
7. Issue one SAN certificate per environment from the edge directory:

   ```sh
   sg docker -c 'sh issue-certs.sh staging'
   sg docker -c 'sh issue-certs.sh production'
   ```

   The script **first** runs certbot against Let's Encrypt's staging CA with
   config/work/log directories in disposable `/dry-run` tmpfs. If that fails,
   live issuance is skipped. It then issues the live pair to persistent storage
   and validates/regenerates/reloads nginx. Staging-CA account/config/certificates
   never replace live state. ACME registers **without email**, using certbot's
   `--register-unsafely-without-email`; no new email/account requirement is
   imposed. There are no expiry warning emails; certificate renewal failures
   require operator inspection until monitoring is added in stage 8.
8. Verify all four names with `curl -sSI http://<host>/` (308 to the same
   HTTPS host) and `curl -sSI https://<host>/` (valid system-trusted TLS).
   A 502 is expected before apps run. Verify HSTS. Repeat the public IP/TLS
   path from the VPS. Confirm edge has only 80/443, production app is absent,
   existing preview/test stacks are intact, and files have expected modes.
9. Once TASK-dep-config is on main, perform the first **staging** deploy using
   the installed gate and a full main SHA as below. Save versions, WebSocket
   origin results, deployed log entry and container status without secrets.
   Production app must remain stopped. Pipeline workflow, environment secrets,
   SSH restriction and automatic staging trigger are TASK-dep-pipeline work.

## Deploy and rollback

The gate accepts exactly one command grammar, with a lowercase full SHA:

```sh
SSH_ORIGINAL_COMMAND='deploy staging <40-hex-main-sha>' /srv/agents/game/bin/deploy-gate
# After pipeline setup, the same command is sent by restricted SSH:
ssh -T <deploy-host> 'deploy staging <40-hex-main-sha>'
```

No shell fragments, extra arguments or other environments are accepted. Invalid
commands and unavailable deployment scripts return 2 with one line. The gate
holds a per-environment file lock across fetch, admission, checkout, build and
health. It fetches main, requires target ancestry from `origin/main`, checks
production's SHA against exact fields in staging's successful `deployed.log`,
then checks out detached and execs that commit's `deploy/deploy.sh`. A main SHA
from before deployment tooling exists is cleanly refused. A successful staging
log entry means a previously verified SHA; it does not assert it is the latest
staging SHA. Production still requires the owner's workflow approval.

The gate resets the caller umask to 022 before checkout; deploy.sh also sets
umask 022 so checked-out and generated public files remain container-readable.
Compose build sets `BUILDX_NO_DEFAULT_ATTESTATIONS=1` without explicit
attestation flags: `--provenance=false --sbom=false` still requested attestation
output with the VPS Compose builder. With defaults disabled, repeated cached builds
of the same SHA retain stable image identity and do not recreate containers.
Deploy validates env ownership and mode, exports `GIT_SHA` / `DEPLOY_ENV`, builds
and runs `up -d --wait --wait-timeout 180 --remove-orphans`. Server migrations
run before readiness. Public health uses the system TLS trust store for
`/api/health` (`status: ok`, target sha), `/version.txt` (target sha), a complete
101 WebSocket handshake with the environment's origin, and explicit HTTP 403 before-upgrade
refusal of a foreign origin. It retries six times with five-second pauses.
No success is logged until every check passes. A failure returns nonzero and
prints at most 80 recent server log lines; it does not print the env file.
Repeated deployment of the same SHA is safe and records another verified event.

Rollback redeploys a previous successfully staged, main-reachable SHA through
the same gate/workflow; production needs owner approval. **Migrations are
forward-only: rollback across an incompatible migration is unsupported.** No
automatic DB rollback or restoration is provided. A failed health check does
not roll back containers automatically; inspect diagnostics and choose a
schema-compatible SHA.

## Deliberate edge updates

The shared edge is independent of both app deployments. Its scripts and nginx
configuration are mounted from `/srv/agents/game/edge/src/deploy/edge`, at the pinned
main SHA recorded by setup. Staging and production gates never touch that
checkout, so deploying or rolling back either app cannot change edge config.
`EDGE_SOURCE_DIR` defaults to that dedicated directory; an override is for
isolated testing or a deliberately recorded copied directory only, never an
app checkout.

To update shared infrastructure, record a separate operation naming the old
and proposed full main SHAs. In `/srv/agents/game/edge/src`, fetch origin/main, verify
`git merge-base --is-ancestor <new-sha> origin/main`, and review the edge diff.
Validate a separate candidate checkout first: render Compose with
`EDGE_SOURCE_DIR=<candidate>/deploy/edge docker compose -p edge -f
<candidate>/deploy/edge/compose.yml config --quiet`, and run its isolated
`deploy/tests/check-edge.sh` (no public ports). Also validate against the live
certificates with a disposable nginx container: mount the candidate edge at
`/edge`, its nginx.conf at `/etc/nginx/nginx.conf`, and `edge_certificates`
read-only at `/etc/letsencrypt`; render `/edge/render.sh` to
`/etc/nginx/conf.d/default.conf` and run `nginx -t`. Do not start a second public
edge or alter live certificate volumes.

After candidate checks pass, run checkout and recreation back-to-back in one
command, substituting the validated full SHA (do not pause between the steps):

```sh
(cd /srv/agents/game/edge/src && git checkout --detach <validated-full-sha> && \
  cd deploy/edge && sg docker -c 'docker compose -p edge -f compose.yml up -d --force-recreate')
```

Recreation is required to pick up file bind mounts and supervisor scripts.
The directory mount can observe checkout changes before the file bind mount
is recreated; keeping these steps together minimizes that update window.
Verify normal system-trusted HTTPS, redirects, HSTS and both environments'
routing on all four names, plus container status and preservation of preview
and test stacks. Confirm the operation with the new pinned SHA and evidence.
On failure, reconcile state and deliberately restore the recorded previous
edge SHA and recreate; never use an app rollback to update shared edge state.
Do not edit or deploy the production app as part of an edge update.

## Renewal and secrets

Certbot runs `renew --webroot` every 12 hours. Nginx regenerates, validates and
reloads config every six hours; manual reload is
`docker compose -p edge -f compose.yml exec -T nginx sh /edge/reload.sh` from the
edge directory through `sg docker`. Certificate and challenge named volumes
belong to `edge`; never run `down -v` on live edge or app projects. Renewal
errors appear in certbot logs. Config validation failure preserves the running
nginx configuration and is logged; correct the certificate/config problem and
retry. Issue scripts are safe to repeat with an unexpired live certificate.

App secrets live only in `/srv/agents/game/<env>/env` (owned by agents, mode 600).
To rotate a DB password, coordinate downtime for that environment: update the
Postgres role password via a private interactive connection (no password on
argv or in logs), atomically replace only that environment's env file retaining
mode 600, recreate its server, and run public health. Changing the env alone
does not change an existing database role. Retain a secure rollback copy until
verified, then delete it. GitHub environment secrets `DEPLOY_SSH_KEY` and
`DEPLOY_KNOWN_HOSTS` are managed by TASK-dep-pipeline. Rotate by replacing the
matching restricted key and secret, verifying the pinned host identity and
refused-command behavior, then revoking the old key. Never log private keys.

## Resources, checks and accepted risks

| Service | CPU | RAM |
| --- | ---: | ---: |
| shared nginx edge | 0.5 | 256 MiB |
| db per environment | 1 | 768 MiB |
| server per environment | 1 | 768 MiB |
| web per environment | 0.25 | 128 MiB |

The VPS has six CPUs and about 7.5 GB RAM. Avoid overlapping heavy builds with
Engineer browser stacks. The owner's preview and isolated Engineer stacks keep
their existing localhost-only ports and separate project names; this runbook
does not retire them. Certbot is transient during issuance and sleeps between
renewals. Shared nginx and the VPS are single points of failure. Staging is
open to everyone. Backups, monitoring, alerting, rate limits and token lifetime
hardening remain stage-8 work; no database backup guarantee exists. Production
stays empty until the owner approves the first deployment.

Repository checks (dummy env only; no VPS or live CA needed):

```sh
python3 -m unittest discover -s deploy/tests -v
shellcheck deploy/edge/*.sh deploy/deploy.sh deploy/tests/check-edge.sh
python3 deploy/tests/check-compose.py
sh deploy/tests/check-edge.sh
openspec validate --all --strict
git diff --check
```

Container checks use disposable nginx containers without published ports or
live networks/volumes. The self-signed certificate bypass in that isolated test
is never used by deployment health or live verification.


## GitHub deployment pipeline

`deploy-staging.yml` waits for the entire `CI` workflow to succeed for a push
to main and deploys that run's exact head SHA. Pull request runs and failures
cannot trigger deployment. Manual rollback/redeploy uses the main workflow ref:

```sh
gh workflow run deploy-staging.yml --ref main -f sha=<full-main-sha>
gh workflow run deploy-production.yml --ref main
# Explicit production rollback candidate (must have passed staging):
gh workflow run deploy-production.yml --ref main -f sha=<full-main-sha>
```

Production resolves and validates the input SHA (or staging `/api/health`
default) in a preceding job with no environment. That job records the exact
commit in the run summary and passes it as a job output. The owner sees that
SHA in the waiting deploy job's name before approving; the gated job deploys
exactly that output even if staging changes while approval is pending.
The gate also checks successful staging history.
The production environment requires reviewer Daniil-33, prevents self-review,
and permits main only. Only the owner dispatches and approves production
deployments. Agents never dispatch, approve or cancel them: the agents' GitHub
identity is currently the owner account, so an agent-dispatched run could not be
approved (self-review prevention) and approval separation is a policy rule, not
a GitHub-enforced one (escalated to the CTO 2026-11-16). The staging environment permits
main only without reviewers. Each environment serializes deployments without
cancelling an in-progress run. Workflow permissions are empty; no checkout or
repository token is needed. Gate and health failures propagate to job failure
with gate diagnostics; failed checks never silently mark a deployment healthy.

Before configuring GitHub or SSH credentials, obtain TL confirmation that the
first stack staging deploy succeeded. Provision and verify both environments
(including production owner protection), keys, secrets and SSH refusal tests
**before PR #47 merges**. Production protection must exist before any workflow using that environment runs on main. After green exact-head CI and independent review,
the TL merges; the merge's own successful CI completion then triggers the
automatic staging deploy. Record each external mutation with
`agentctl operation intend` and confirm only after read-only verification.
Use `gh api` to create/update environments and deployment branch policies;
verify the production protection response explicitly. If this plan cannot
provide required owner protection, stop and escalate rather than weakening it.

For each environment, generate an ed25519 key in a private temporary directory
on the VPS with `umask 077`. Back up `~/.ssh/authorized_keys` before editing;
preserve all existing entries and append only this key with:

```text
restrict,command="/srv/agents/game/bin/deploy-gate" ssh-ed25519 <public-part> deploy-<env>
```

Upload the private part using `gh secret set DEPLOY_SSH_KEY --env <env> < <key-file>`.
Set `DEPLOY_KNOWN_HOSTS` from the VPS's verified host public key, with host
identity `149.5.209.208`; do not trust an unverified network key scan. Verify
secret names and environment scope without reading values. Before deleting the
local private key, verify `ssh -T ... id` and a no-command interactive attempt
are refused by the forced gate. Never print key files or put them in evidence.
Delete private files after upload and verification, including on failure.
Workflow key and known-hosts files have mode 600 in RUNNER_TEMP and are removed
by an always step. Rotation follows the same recorded sequence: add replacement,
upload its secret, verify restriction/deploy, remove the old public entry, and
delete temporary private files. Retain the authorized_keys backup securely.

CI has independent `compose-browser` (production entropy/recovery) and
`compose-browser-seeded` (deterministic fixture) jobs, each limited to 35 minutes.
Both cache Playwright browsers by OS, architecture and lockfile; system browser
dependencies are still installed. Each job sanitizes evidence before its own
artifact upload and removes only its disposable Compose stack. Measure each
job's elapsed time and report `35 minutes - elapsed` headroom on the final PR.

The public two-browser staging smoke is opt-in and is never selected by normal
CI. It creates guests and a room, completes setup and a turn, verifies WSS to
stage-api, captures screenshots and sanitized traces, and resigns the guest.
Run locally from the repository, then sanitize all artifacts before copying:

```sh
pnpm exec playwright test --config playwright.staging.config.ts
python3 scripts/sanitize-artifacts.py test-results playwright-report
```

Only copy artifacts after successful sanitization to the task evidence directory.
Store run URLs, exact SHAs, pending-production API output, refusal results and
CI durations there; never store private keys, tokens or unsanitized traces.
