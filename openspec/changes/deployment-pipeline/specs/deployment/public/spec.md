## ADDED Requirements

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
CI SHALL run production compose-browser and deterministic compose-browser-seeded separately with 35-minute limits, cached Playwright browsers, sanitized evidence and independent cleanup. Public staging smoke SHALL remain opt-in outside CI and verify two browsers complete setup and a turn over the staging API WSS connection.

#### Scenario: Delivery validation
- **WHEN** a PR runs CI
- **THEN** both browser jobs gate whole-workflow success and measured durations establish remaining headroom


### Requirement: Provisioning before pipeline activation
After TL confirmation of first staging success, environments, keys, secrets and SSH refusal checks SHALL be provisioned and verified before the pipeline PR merges. Production owner protection SHALL exist before any workflow references that environment.

#### Scenario: Provisioning and merge order
- **WHEN** the TL confirms the first staging deploy succeeded
- **THEN** recorded provisioning backs up authorized_keys, preserves existing entries, installs restricted keys and verifies command and interactive refusals
- **AND** private keys are deleted after secret upload and verification
- **AND** only after protection and credentials are verified does the TL merge, allowing that merge's successful CI completion to trigger staging
