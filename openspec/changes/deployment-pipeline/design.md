## Context
TASK-dep-pipeline revision 1 implements the accepted deployment design on base 7634003. Stack provisioning is complete; external configuration waits for TL confirmation of first staging success.

## Decisions
Staging accepts only successful whole-CI push/main completions, deploying their exact SHA; manual dispatch requires a SHA and main workflow ref. Production resolves an omitted SHA from trusted staging HTTPS health and uses the production environment owner gate. Both validate lowercase 40-hex SHAs, serialize without cancellation, use pinned known_hosts and mode-600 RUNNER_TEMP files with unconditional cleanup. SSH failures propagate unchanged.

Split production and deterministic browser stacks into independent 35-minute jobs; cache Chromium using the lockfile and runner platform. Preserve sanitization before upload. Public staging smoke is opt-in, uses isolated browser contexts and existing trace sanitization, and checks WSS origin.

## Operations and risks
Recorded intent/verification/confirmation governs environments, backed-up authorized_keys, ephemeral private keys and secrets. Production requires Daniil-33 with self-review prevention; agents never approve or cancel it. Stop and escalate unavailable protection. Existing gate admission and migration restrictions remain. Rollback uses dispatch and owner approval for production. No game behavior or gate contract changes.

## Validation
Actionlint, strict OpenSpec validation, browser typecheck, diff checks, exact-head CI timings and independent review precede TL merge. After dependency confirmation, verify automatic staging, rejected deploy, pending production review, SSH restrictions and two-browser public smoke. Never retain private key material in evidence.
