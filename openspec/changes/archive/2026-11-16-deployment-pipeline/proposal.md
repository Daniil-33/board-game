## Why
Merged infrastructure needs automated staging delivery and owner-controlled production promotion, with CI headroom for later stages.

## What Changes
- Add success-only staging and manual production workflows with restricted pinned SSH credentials.
- Split and cache browser CI; add opt-in public staging smoke and operator instructions.

## Capabilities
### New Capabilities
None.
### Modified Capabilities
- `deployment/public`: workflow triggers, approval, credential lifecycle and CI delivery gates.

## Impact
GitHub workflows/environments, deploy keys, browser verification and deployment runbook. TASK-dep-pipeline revision 1 and accepted effort design control scope. Game code, mechanics, production approval and monitoring are out of scope. GAME-BREAKDOWN.md game rules are unchanged; no game-rule section applies to this infrastructure change.
