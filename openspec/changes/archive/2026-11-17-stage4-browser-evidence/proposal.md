## Why
Stage 4 needs Compose browser proof of the accepted rent and building rules before completion.

## What Changes
- Add pre-roll test fixtures, integration proof, and three-client browser scenarios for TASK-s4-e2e AC1–8.
- Run on an isolated fixture Compose stack inside the existing browser CI job; preserve earlier suites unchanged.
- Record evidence, runtime headroom and stage 4 implementation links.

## Capabilities
No spec-level behavior changes. This is test infrastructure and evidence for existing engine/rent and engine/houses behavior from GAME-BREAKDOWN.md § «Активы, рента и строительство».

## Impact
Only e2e, test Compose/CI wiring, ROADMAP, and the explicitly authorized server fixture builder and stage4 integration tests. Loader, guards, persistence and product code are out of scope.
