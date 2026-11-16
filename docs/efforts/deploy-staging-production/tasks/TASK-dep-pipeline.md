# Team Lead -> Engineer Task Handoff

```yaml
id: TASK-dep-pipeline
revision: 1
effort: EFF-deploy-staging-production
project: economic-board-game
source_commit: TBD # main after TASK-dep-config and TASK-dep-stack merge; set on delivery
owner: team-lead
status: proposed
```

## Outcome

A merge to `main` deploys to staging automatically after green CI; production
deploys only a staging commit and only after the owner approves in GitHub;
the deploy key can do nothing but deploy; CI has headroom for stages 4-8.

## Acceptance criteria

1. `.github/workflows/deploy-staging.yml`: triggered by `workflow_run` of
   `CI` (`completed`, branch `main`, event `push`) and runs only when the
   conclusion is `success`; deploys exactly `workflow_run.head_sha` with
   `ssh … deploy staging <sha>` in environment `staging`. Also
   `workflow_dispatch` with a `sha` input (rollback/redeploy). Concurrency
   group `deploy-staging`, `cancel-in-progress: false`. Minimal
   `permissions`.
2. `.github/workflows/deploy-production.yml`: `workflow_dispatch` with
   optional `sha` (default: the SHA reported by
   `https://stage-api.focusima.space/api/health`), validates it is 40 hex,
   environment `production`; deploys with `deploy production <sha>`.
   Concurrency group `deploy-production`.
3. SSH: `StrictHostKeyChecking yes` with `DEPLOY_KNOWN_HOSTS` (pinned host
   key line), key from `DEPLOY_SSH_KEY`, written to a 600 temp file and
   removed in an `always()` step; no `set -x`; nothing secret echoed. A
   failed health check fails the job visibly with the gate's message.
4. CI headroom (C10): split `compose-browser` into `compose-browser`
   (production-stack specs) and `compose-browser-seeded` (deterministic
   stack), each with `timeout-minutes: 35`, Playwright browser cache; both
   upload sanitized evidence as today. Report measured durations and
   headroom. The staging deploy waits for the whole `CI` workflow.
5. GitHub configuration (recorded operations, via `gh api`):
   - environment `staging` (no reviewers; deployment branch policy `main`);
   - environment `production`: required reviewer `Daniil-33`,
     `prevent_self_review: true`, deployment branch policy `main`;
   - per-environment secrets `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS`.
   Agents never approve a production deployment.
6. Keys (recorded operations): one ed25519 key per environment generated on
   the VPS; public parts added to `~/.ssh/authorized_keys` as
   `restrict,command="/srv/game/bin/deploy-gate" ssh-ed25519 …
   deploy-<env>` (existing entries untouched, file backed up first); private
   parts uploaded with `gh secret set --env <env> < file` and then deleted;
   no key material in Git, logs, evidence or checkpoints.
7. Runbook (`docs/deployment.md`) updated with the workflows, approval flow,
   rollback via dispatch, key rotation, CI job layout.
   Also close REV-dep-stack-2 RVW-004: the edge update procedure must not
   expose new scripts to the running edge before the recreate (per-SHA edge
   directories switched at recreate time, or checkout and recreate as one
   back-to-back command), documented in the runbook.

Evidence:

8. A merge to `main` (this PR's merge is fine) triggers an automatic staging
   deploy that succeeds; run link; `https://stage.focusima.space/version.txt`
   equals the merged SHA.
9. Unhealthy deploy fails visibly: a dispatch (or gate dry run) whose health
   check cannot pass (e.g. a SHA not reachable from `main`, or a dry-run mode
   with a wrong expected SHA) fails the workflow with a clear message; link.
10. The production workflow, dispatched once, waits for the owner's review
    (API output of the pending deployment / environment protection); it is
    left for the owner, not approved or cancelled by agents unless the CTO
    says so.
11. The deploy key refuses other commands: `ssh -i <staging key> … 'id'` and
    an interactive session are refused (output captured before the private
    key is deleted, or with a throwaway test key installed with the same
    options and removed afterwards).
12. Two browsers play setup and a turn on `https://stage.focusima.space`
    through `stage-api.focusima.space` over WSS (Playwright against staging,
    run locally, not in CI; sanitized trace/screenshot in evidence).

## Scope and non-goals

In scope: `.github/workflows/**`, runbook updates, small `deploy/**` fixes
needed for the workflow (reported), GitHub environments/secrets, the
`authorized_keys` entries, a staging Playwright smoke config (not run in CI).

Not in scope: game code; production traffic beyond waiting for approval;
monitoring and backups (stage 8).

## Canonical references

- `docs/efforts/deploy-staging-production.md` revision 1.
- `docs/efforts/deploy-staging-production/design.md`.
- `docs/deployment.md` (from TASK-dep-stack), `.github/workflows/ci.yml`.

## Constraints and invariants

Never push to `main`; never approve production; never print secrets; the
gate contract is fixed (`deploy <env> <sha>`); only the four hosts.

## Dependencies

Starts after `TASK-dep-config` and `TASK-dep-stack` merge and the stack
task's VPS operations are confirmed.

## Delegated decisions

Workflow structure details, caching, staging smoke test shape. Return to the
Team Lead before changing the gate contract, environment protection or the
trigger semantics.

## Required workflow

Explore -> short plan in a report (`agentctl engineer report --wake`) ->
Team Lead approval -> Apply -> Verify -> PR -> independent review ->
merge by the Team Lead -> operations and evidence 8-12 -> report.

## Required checks

`actionlint` (or equivalent) on workflows, `git diff --check`, green CI with
both browser jobs on the PR head, operation records confirmed.

## Escalation conditions

GitHub refusing environment protection on this plan; the forced command
not enforceable; any need for a new account or paid feature.

## Deliverables

Workflows, runbook update, branch `agent/task-dep-pipeline`, PR, CI evidence,
review report, operation records, evidence 8-12 in
`/srv/agents/evidence/TASK-dep-pipeline/` (no secrets), residual risks.

The Engineer accepts the exact revision before editing. A material change
creates a new revision.
