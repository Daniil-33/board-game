# Tasks

## 1. Board rendering root cause

- [ ] 1.1 Isolate the chance-loss-plus-charge rendering failure from reveal-only and charge-only states, identify the causal client file and line, implement the smallest fix, and verify all 40 sampled cell centres are opaque with at least the desktop distinct-colour count at 390x844; add a focused client unit test if JavaScript logic changes.

## 2. Responsive stage 6 surfaces

- [ ] 2.1 Correct mobile surface geometry while preserving desktop centring, and add permanent browser assertions for chance gain, chance loss plus charge, casino result, and casino decision at direct, resize, and rotation checkpoints; verify viewport bounds, no horizontal scroll, board pixels, desktop centring at 1440x900 and 1920x1080, and save screenshots plus geometry JSON for all checkpoints.

## 3. Integration verification and evidence

- [ ] 3.1 Run `pnpm build`, `pnpm test`, client lint, `openspec validate --all --strict`, stage 3-5, load-split, stage6-client-smoke, and the new regression browser suite; compare Node 22 per-file gzip bundle sizes at base and head, verify CI 4/4 on the exact head, inspect the final diff and required records diff, and write the evidence and root-cause file:line into the PR body.

## Workflow follow-up

- Archive this OpenSpec change before requesting the exact-head independent review, as required by the task handoff.
- Open the assigned PR, request independent review with the full 40-character head SHA, and address supported findings. Do not merge.
