# deployment/public Specification

## Purpose

Provide isolated public staging and production delivery on one node with TLS, restricted commit deployment and observable health verification.

## Requirements

### Requirement: Public TLS edge
The public deployment SHALL publish only edge ports 80 and 443 and serve only focusima.space, api.focusima.space, stage.focusima.space and stage-api.focusima.space. HTTP SHALL serve ACME challenges and redirect other requests to HTTPS. HTTPS SHALL use HSTS and route each host to its environment. Access logs SHALL omit query strings.

#### Scenario: Public request routing
- **WHEN** a request arrives for one of the four configured hosts
- **THEN** HTTP serves its ACME challenge or redirects to HTTPS
- **AND** HTTPS routes web traffic to web and API /api/ and /ws traffic to server in the matching environment
- **AND** WebSocket upgrades support one-hour timeouts and logs contain paths without query strings

#### Scenario: Environment absent
- **WHEN** an environment has no running app containers but its certificates exist
- **THEN** the edge starts and serves TLS with a 502 or maintenance response for that environment

### Requirement: Independent edge revision
The shared edge SHALL run from a dedicated checkout pinned to a main SHA and updated only by a recorded operation. App deployments SHALL never change its configuration.

#### Scenario: App deploy or rollback
- **WHEN** staging or production deploys or rolls back to another SHA
- **THEN** the dedicated edge checkout and its mounted configuration remain at the separately recorded revision

### Requirement: Certificate lifecycle
The edge SHALL bootstrap HTTP before certificates exist. Certificate issuance SHALL support a staging-CA dry run before live issuance, with one SAN certificate per environment. Staging-CA state SHALL be disposable and isolated from live certificates; no-email registration SHALL be documented. Renewal SHALL run every 12 hours and nginx SHALL reload every 6 hours without manual intervention.

#### Scenario: First issuance and renewal
- **WHEN** a clean edge is started without certificate files
- **THEN** its HTTP challenge endpoint is available for issuance
- **AND** after live issuance HTTPS serves valid certificates for both host pairs and subsequent renewal is picked up automatically

### Requirement: Environment isolation
Staging and production SHALL use separate Compose projects, databases, named volumes and secrets. App services SHALL publish no host ports. Only server and web SHALL join their environment's external edge network; database SHALL stay on its internal network. Services SHALL restart unless stopped and use the accepted resource limits.

#### Scenario: Independent stacks
- **WHEN** both environments run
- **THEN** their storage and networks remain separate, database ports are not public, and persisted data survives redeployment
- **AND** the local Compose stack retains its localhost-only port bindings

### Requirement: Restricted deployment gate
The gate SHALL accept only `deploy (staging|production) <40 lowercase hex>` via SSH_ORIGINAL_COMMAND, reject all other input with exit 2 and one line, and never evaluate input as shell code. It SHALL lock per environment, fetch origin, require the SHA reachable from origin/main, and require a successful staging log entry for production before detached checkout and deployment.

#### Scenario: Invalid input
- **WHEN** input contains extra arguments, shell metacharacters, a wrong environment or a malformed SHA
- **THEN** the gate rejects it before invoking Git or Docker

#### Scenario: Admission and serialization
- **WHEN** an otherwise valid deployment is requested
- **THEN** it runs under an environment lock only after reachability validation
- **AND** production is refused if the SHA is absent from staging's successful deployed.log
- **AND** Docker access works in the forced-command context

#### Scenario: Target predates deployment tooling
- **WHEN** an admitted target checkout lacks executable deploy/deploy.sh
- **THEN** the gate refuses with exit 2 and one line without attempting deployment

### Requirement: Deployment health and audit
Deploy SHALL build with GIT_SHA, converge services with wait and remove-orphans, then verify public HTTPS API health and client version equal the target SHA, allowed-Origin WebSocket upgrade returns 101, and foreign-Origin upgrade is refused with HTTP 403 before upgrade. Success SHALL append UTC time and SHA to deployed.log. Failure SHALL exit nonzero with a clear message and recent server logs without printing secrets. Repeating a SHA SHALL be safe.

#### Scenario: Healthy deployment
- **WHEN** services converge and every public check passes
- **THEN** the target SHA is recorded as successfully deployed

#### Scenario: Unhealthy deployment
- **WHEN** startup fails, a SHA differs, an allowed upgrade fails or a foreign upgrade is accepted
- **THEN** deployment exits nonzero with diagnostics and does not append a successful deployment entry

### Requirement: Operational boundaries
The runbook SHALL document setup, deployment, rollback, certificate lifecycle, secret locations and rotation, coexistence, resource limits and risks. VPS provisioning SHALL preserve preview and test stacks and prepare production without deploying its app. External operations SHALL have recorded intent, verification and confirmation.

#### Scenario: Initial provisioning
- **WHEN** approved merged infrastructure is provisioned
- **THEN** mode-600 environment files and read-only HTTPS checkouts exist under /srv/agents/game, edge networks and valid TLS are prepared, and staging is verified once config support is merged
- **AND** before live issuance the VPS-to-own-public-IP HTTPS path is verified, with failure escalated to the Team Lead without root or host-file workarounds
- **AND** production has no app deployment without owner approval

### Requirement: Automated staging delivery
Staging SHALL deploy exactly the head SHA of a successful completed CI workflow for a push to main, or a required manually dispatched SHA from main. It SHALL serialize with concurrency group deploy-staging without cancellation and use environment staging with main-only deployment policy and no reviewers.

#### Scenario: CI completion
- **WHEN** CI completes successfully for a push on main
- **THEN** staging deploys workflow_run.head_sha after all CI jobs pass
- **AND** failed CI, pull request CI and other branches do not deploy

### Requirement: Owner-approved production workflow
Production SHALL accept main-only manual dispatch and resolve and validate the input or staging-health SHA before owner approval. A job without an environment SHALL publish the lowercase 40-hex SHA as an output, summary and gated job name. The production environment job SHALL deploy exactly that output and serialize without cancellation. Production SHALL require Daniil-33 approval, prevent self-review and allow main only. Agents SHALL never approve or cancel production deployment.

#### Scenario: Production promotion
- **WHEN** production is dispatched without a SHA
- **THEN** staging health supplies the candidate SHA before approval and the deployment displays that SHA while waiting for the owner before SSH runs
- **AND** the existing gate refuses commits without successful staging history

### Requirement: Workflow SSH credentials
Each environment SHALL have a separate restricted ed25519 key and pinned DEPLOY_KNOWN_HOSTS and DEPLOY_SSH_KEY secrets. Workflows SHALL use strict host checking, mode-600 temporary files and unconditional cleanup without logging secrets. Gate failures SHALL fail the job with diagnostics.

#### Scenario: Refused command or failed deploy
- **WHEN** a credential attempts a different command or deployment fails health
- **THEN** the command fails visibly and no credential is exposed in logs or artifacts

### Requirement: Browser CI headroom
CI SHALL run production compose-browser, isolated-fixture compose-browser-fixtures and deterministic compose-browser-seeded as separate parallel jobs with 35-minute limits, cached Playwright browsers, per-job sanitized evidence artifacts and independent cleanup. Public staging smoke SHALL remain opt-in outside CI and verify two browsers complete setup and a turn over the staging API WSS connection.

#### Scenario: Delivery validation
- **WHEN** a PR runs CI
- **THEN** all browser jobs gate whole-workflow success and measured durations establish remaining headroom

### Requirement: Provisioning before pipeline activation
After TL confirmation of first staging success, environments, keys, secrets and SSH refusal checks SHALL be provisioned and verified before the pipeline PR merges. Production owner protection SHALL exist before any workflow using that environment runs on main.

#### Scenario: Provisioning and merge order
- **WHEN** the TL confirms the first staging deploy succeeded
- **THEN** recorded provisioning backs up authorized_keys, preserves existing entries, installs restricted keys and verifies command and interactive refusals
- **AND** private keys are deleted after secret upload and verification
- **AND** only after protection and credentials are verified does the TL merge, allowing that merge's successful CI completion to trigger staging

### Requirement: Deployment file and build reproducibility
The gate SHALL reset umask to 022 before checkout and deploy.sh SHALL use umask 022 so public checkout and generated files remain readable to container users. Compose build SHALL disable default provenance and SBOM attestations so a cached same-SHA redeploy retains image identity and does not recreate unchanged containers.

#### Scenario: Restrictive caller and repeated deployment
- **WHEN** a caller uses umask 077 and deploys the same SHA twice
- **THEN** checkout directories and public files remain readable to container users
- **AND** both builds disable provenance and SBOM attestations
