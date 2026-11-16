# Proposal

## Why

The local Compose stack cannot provide the accepted public staging and production endpoints. TASK-dep-stack supplies the single-node deployment infrastructure approved in EFF-deploy-staging-production revision 1 and its Team Lead design.

## What Changes

- Add a shared nginx TLS edge, certificate bootstrap and automatic renewal for the four accepted hosts.
- Add isolated application Compose projects, a strict SSH deploy gate, version and origin health checks, and offline script tests wired into the existing ci job.
- Document setup, operations, rollback, secrets and coexistence; prepare the VPS after merge, then deploy staging after TASK-dep-config merges.
- Preserve the localhost-only local stack.

## Capabilities

### New Capabilities

- `deployment/public`: TLS edge, isolated environments, restricted deployment and public health verification.

### Modified Capabilities

None. `deployment/compose` continues to describe the local stack.

## Impact

Touches deploy/**, deployment script tests, one ci step, docs/deployment.md and deployment specs. Depends on TASK-dep-config for ALLOWED_ORIGINS, API_ORIGIN, GIT_SHA, /api/health and /version.txt. Host operations use agentctl intent/verify/confirm records and never require sudo.

Out of scope: application changes, workflow/environment/key provisioning (TASK-dep-pipeline), compose-browser changes, backups, monitoring, production deployment and new product rules. GAME-BREAKDOWN.md “MVP: что входит и что отложено” remains unchanged; no gameplay section is affected.
