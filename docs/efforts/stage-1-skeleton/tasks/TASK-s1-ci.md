# Team Lead -> Engineer Task Handoff

```yaml
id: TASK-s1-ci
revision: 1
effort: EFF-stage-1-skeleton
project: economic-board-game
source_commit: 5a05807 # board-game main, merge of PR #1
owner: team-lead
status: proposed
```

## Outcome

Hosted CI (GitHub Actions) for `github.com/Daniil-33/board-game`. It runs on
every pull request to `main` and every push to `main`, so later stage 1 PRs can
merge automatically after independent review and green CI.

## Acceptance criteria

1. A workflow under `.github/workflows/` runs on `pull_request` targeting
   `main` and on `push` to `main`.
2. Steps: checkout; pnpm 9.15.9 (match `packageManager` or pin it in the
   action); Node 22 LTS; `pnpm install --frozen-lockfile`; workspace typecheck;
   workspace tests. A failed step fails the job.
3. A single stable job name (for example `ci`) that the owner can later mark as
   a required status check.
4. A pnpm store cache keyed on `pnpm-lock.yaml`.
5. The root `package.json` declares `packageManager: "pnpm@9.15.9"` and
   `engines.node` matching the CI Node major, and `pnpm build` and `pnpm test`
   stay the entry points used by CI.
6. Proof: the PR's own CI run is green on its head SHA. A deliberately broken
   commit (type error or failing test) on a throwaway branch makes CI red;
   record that run's URL, then delete the throwaway branch.

## Scope and non-goals

In scope: `.github/workflows/*`, root `package.json` metadata fields, an
optional `.nvmrc`.

Not in scope: lint/format tooling, Docker or Postgres in CI (added by later
tasks that need them), deploy jobs, branch-protection settings (owner action),
any change under `packages/` or `apps/`.

## Canonical references

- `docs/efforts/stage-1-skeleton.md` § "Dependencies, risks, and limits" (first task: CI).
- `/srv/agents/infrastructure/AGENTS.md` § "Current product intake boundary".
- `ROADMAP.md` § "Технические решения" (pnpm workspaces, vitest).

## Constraints and invariants

- Never push to `main`. Work on branch `agent/task-s1-ci`, open a PR.
- Push over HTTPS: `git -c credential.helper= -c credential.helper='!gh auth git-credential' push ...`.
- pnpm 9.15.9 is in `~/.local/bin`.
- No secrets in the workflow; it needs only the default token with read permissions.

## Dependencies

None. Other stage 1 tasks rebase on this once merged.

## Delegated decisions

Action versions, cache strategy, job layout, Node 22 minor. Return to the Team
Lead if CI needs anything beyond the default `GITHUB_TOKEN`.

## Required workflow

Small atomic task: Explore -> Apply -> Verify -> PR -> Review fixes in one
context (no separate proposal checkpoint and no OpenSpec change: it has no
product or engine behavior). Report the PR URL and head SHA through
`agentctl engineer report --wake`.

## Required checks

Local `pnpm install --frozen-lockfile && pnpm build && pnpm test` pass; green
CI on the PR head; red-run evidence from criterion 6; `git diff --check`.

## Escalation conditions

Actions are disabled on the repo, or a workflow cannot run without new secrets
or settings changes; the existing tests fail on clean `main`.

## Deliverables

Branch, PR, green CI URL for the head SHA, red-run URL, independent review
report, residual risks.

The Engineer accepts the exact revision before editing. A material change
creates a new revision.
