## 1. Decision visibility

- [x] 1.1 Update purchase presentation so only the deciding player receives the locked dialog; other viewers receive live non-modal status with decider, asset, price, and countdown. Add bystander, eliminated-viewer, responder-lock, accessibility, and chat interaction tests. (Spec: `client/game-screen` → Responsive decision and asset surfaces.)
- [x] 1.2 Update auction presentation so only the mobile responder receives the locked sheet; other viewers see inline auction content on mobile and desktop. Preserve sheet opening on responder change and add/adjust tests. (Spec: `client/game-screen` → Responsive decision and asset surfaces.)

## 2. Rent schedule and browser synchronization

- [x] 2.1 Make `rentTiers` expose logistics holdings from 1 through group size and retain parity coverage against `rentFor`. (Canonical source: `GAME-BREAKDOWN.md` → “Активы, рента и строительство”; no other core change.)
- [x] 2.2 Synchronize all clients to the acting client's revision after prompt resolution and end-turn actions in `e2e/compose.spec.ts` and `e2e/game-layout.spec.ts`.

## 3. Specification and delivery evidence

- [x] 3.1 Restore “only from server-projected data” wording in the canonical Asset inspection statement within strict-validation length limits.
- [x] 3.2 Run required build, test, lint, e2e typecheck, strict OpenSpec validation, diff checks, affected Compose browser specs, and bundle-size comparison.
- [x] 3.3 Capture bystander purchase and mobile auction status at 1440x900 and 390x844 in `/srv/agents/evidence/TASK-vd-dialogs-followup/`.
- [x] 3.4 Open/update the PR, confirm CI, request independent review, resolve findings, and archive the OpenSpec change after review passes.
