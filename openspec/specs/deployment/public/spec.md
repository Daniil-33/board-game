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
- **THEN** mode-600 environment files and read-only HTTPS checkouts exist under /srv/game, edge networks and valid TLS are prepared, and staging is verified once config support is merged
- **AND** before live issuance the VPS-to-own-public-IP HTTPS path is verified, with failure escalated to the Team Lead without root or host-file workarounds
- **AND** production has no app deployment without owner approval
