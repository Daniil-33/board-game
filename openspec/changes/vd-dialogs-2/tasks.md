## 1. Specification and implementation
- [x] 1.1 Extend `client/game-screen` requirements for frame-aligned purchase, auction, asset, rent/debt, elimination, game-over, temporary jail-attempt status, and product-name presentation, including projection limits.
- [x] 1.2 Restyle purchase and auction surfaces with projected group/queue data and existing action reasons.
- [x] 1.3 Restyle asset, rent/debt, elimination surfaces and temporary jail-attempt status using only current board/view fields.
- [x] 1.4 Restyle game over and shell/document title; preserve existing actions and test ids.
- [x] 1.5 Add component assertions for key structures, reason text, current rent tier, and auction queue states.

## 2. Verification and evidence
- [x] 2.1 Run required build, unit tests, client lint, e2e typecheck, strict OpenSpec validation, and diff check; run heavy suites sequentially with one Playwright worker.
- [x] 2.2 Record per-chunk gzip baseline/delta and ensure total bundle is at most 343,863 B gzip and task delta at most +4 KB.
- [ ] 2.3 Capture every in-scope surface at applicable desktop and 390x844 mobile viewports with the committed producer; record head and served version and index each capture beside its frame.
- [ ] 2.4 Open PR, record CI evidence, request independent review, resolve supported findings, and archive after merge per project policy.
