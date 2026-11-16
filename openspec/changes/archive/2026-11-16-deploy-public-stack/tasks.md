# Tasks

## 1. TLS edge

- [x] 1.1 Implement deploy/edge Compose and nginx bootstrap/routing (Public TLS edge, Certificate lifecycle); verify Compose config, nginx config with missing/present certificates, absent-app DNS, host restrictions and query-free logging.
- [x] 1.2 Implement certificate issuance and renewal/reload scripts (Certificate lifecycle); verify shellcheck and fake certbot tests including isolated staging-CA state; document issuance and renewal in docs/deployment.md.

## 2. Environment Compose

- [x] 2.1 Implement deploy/app/compose.yml (Environment isolation); verify both project configs with dummy env, no published ports, distinct aliases, volumes, limits and build args; document layout, origins, resources and coexistence in runbook.

## 3. Restricted gate

- [x] 3.1 Implement deploy/deploy-gate (Restricted deployment gate); run offline tests for invalid grammar/metacharacters/extra args, ancestry, production staging admission, locking and Docker forced-command access; document invocation and installation.

## 4. Deploy and health

- [x] 4.1 Implement public health helper (Deployment health and audit); test API/client SHA mismatch, TLS/network errors, valid upgrade and foreign-Origin refusal with local fakes.
- [x] 4.2 Implement deploy/deploy.sh (Deployment health and audit); test fake build/up/health failures produce nonzero status, bounded diagnostics and no success record, and successful repeat SHA is safe; shellcheck clean.
- [x] 4.3 Complete runbook deploy/rollback, secrets/rotation, ordered setup, risks and operation evidence instructions (Operational boundaries); check against every handoff criterion without printing secrets.

## 5. Integration verification

- [x] 5.1 Add minimal ci script-check step; verify offline tests and shellcheck run without VPS access, leaving compose-browser ownership unchanged.
- [x] 5.2 Run script tests, shellcheck, both Compose config checks, openspec validate --all --strict and git diff --check; inspect diff against TASK-dep-stack revision 1 and record evidence.

## Workflow follow-up

- Report proposal checkpoint with agentctl engineer report --wake and await Team Lead approval before Apply; fresh Apply context as required by role policy.
- Commit/push branch through recorded external-operation protocol, open PR, run independent review using agentctl review start, resolve findings and confirm green CI at exact head.
- Archive change in PR after review passes, validate resulting specs, and hand off merge to Team Lead.
- After merge only: record and confirm /srv/agents/game directories, mode-600 generated env files, public HTTPS checkouts and installed gate; preserve preview/test stacks.
- Record and confirm edge networks/startup and staging-CA dry runs followed by live certificate issuance. Save TLS/redirect evidence for all four hosts without secrets.
- After TASK-dep-config merges: record and confirm first manual staging deploy through installed gate and public health checks; no production deploy.
- Report concrete evidence, operation IDs and residual risks through agentctl; wait for Team Lead acceptance.
