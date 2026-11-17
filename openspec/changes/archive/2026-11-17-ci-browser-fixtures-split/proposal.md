## Why
`compose-browser` took 21 of its 35 minutes after stage 5; stages 6-7 add more browser scenarios (TASK-vd-chat, visual-design C12).

## What Changes
- Move the isolated stage 4-5 fixture stack out of `compose-browser` into a new parallel job `compose-browser-fixtures` with its own evidence artifact, sanitization and teardown.
- `compose-browser` keeps the production stack scenarios; `compose-browser-seeded` is unchanged.
- The staging deploy keeps triggering on the whole CI workflow's success, so the new job gates it too.

## Capabilities
### Modified Capabilities
- `deployment/public`: the browser CI headroom requirement names the three browser jobs.

## Impact
`.github/workflows/ci.yml`, `docs/deployment.md`. No product code.
