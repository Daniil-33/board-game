## Repository implementation
- [x] 1. Implement Automated staging delivery, Owner-approved production workflow and Workflow SSH credentials in workflows; validate actionlint.
- [x] 2. Implement Browser CI headroom split/cache and opt-in staging smoke; verify browser typecheck.
- [x] 3. Document workflow operations, approval, rollback and key rotation; verify strict specs and diff.
## Delivery and operations
- [ ] 4. Push PR, obtain green exact-head CI, measure job headroom and obtain independent review (including RVW-001/002 fixes); wait for TL provisioning go.
- [ ] 5. After TL confirms first staging success, provision recorded environments (production protection before any reference), keys and secrets and verify restrictions BEFORE PR #47 merges (Workflow SSH credentials).
- [ ] 6. After provisioning verification, TL merges; collect the merge CI-triggered automatic staging, failed deployment, pending production review and public smoke evidence; report acceptance.
