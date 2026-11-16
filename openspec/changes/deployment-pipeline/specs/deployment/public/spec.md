## ADDED Requirements

### Requirement: Automated staging delivery
Staging SHALL deploy exactly the head SHA of a successful completed CI workflow for a push to main, or a required manually dispatched SHA from main. It SHALL serialize with concurrency group deploy-staging without cancellation and use environment staging with main-only deployment policy and no reviewers.

#### Scenario: CI completion
- **WHEN** CI completes successfully for a push on main
- **THEN** staging deploys workflow_run.head_sha after all CI jobs pass
- **AND** failed CI, pull request CI and other branches do not deploy

### Requirement: Owner-approved production workflow
Production SHALL accept manual dispatch from main only, resolve an omitted SHA from staging HTTPS health, validate a lowercase 40-hex SHA and deploy through environment production with concurrency group deploy-production without cancellation. The environment SHALL allow main only and require Daniil-33 approval with self-review prevention. Agents SHALL never approve or cancel production deployment.

#### Scenario: Production promotion
- **WHEN** production is dispatched without a SHA
- **THEN** staging health supplies the candidate SHA and the deployment waits for the owner before SSH runs
- **AND** the existing gate refuses commits without successful staging history

### Requirement: Workflow SSH credentials
Each environment SHALL have a separate ed25519 key restricted to the installed gate, pinned DEPLOY_KNOWN_HOSTS and DEPLOY_SSH_KEY secrets. Workflows SHALL use strict host checking, mode-600 temporary files and unconditional cleanup without logging secrets. Gate failures SHALL fail the job with diagnostics. Provisioning SHALL back up authorized_keys, preserve existing entries, verify command and interactive refusal, and delete private keys after secret upload and verification.

#### Scenario: Refused command or failed deploy
- **WHEN** a credential attempts a different command or deployment fails health
- **THEN** the command fails visibly and no credential is exposed in logs or artifacts

### Requirement: Browser CI headroom
CI SHALL run production compose-browser and deterministic compose-browser-seeded separately with 35-minute limits, cached Playwright browsers, sanitized evidence and independent cleanup. Public staging smoke SHALL remain opt-in outside CI and verify two browsers complete setup and a turn over the staging API WSS connection.

#### Scenario: Delivery validation
- **WHEN** a PR runs CI
- **THEN** both browser jobs gate whole-workflow success and measured durations establish remaining headroom
