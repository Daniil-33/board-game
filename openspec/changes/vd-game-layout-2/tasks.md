# Tasks

## 1. Desktop composition and settings

- [x] 1.1 Implement the desktop top bar, board-centred turn/dice/journal composition, settings popover, and 1440×900 fit; retain mobile navigation and test ids. Verify with focused game-layout tests and the desktop screenshot.
- [x] 1.2 Update phase-relevant actions and board-centre captions from the current projection. Verify phase visibility/reasons and auction caption with component/unit tests.

## 2. Count localization

- [x] 2.1 Sweep numeric count messages in Russian and English locales and add correct plural forms. Verify Russian 1, 2, 5, 11, 21 and English singular/plural in unit tests.

## 3. Integration and evidence

- [x] 3.1 Capture game-desktop at 1440×900 and mobile board, purchase, and auction at 390×844 using the committed producer with E2E_SCREEN_EVIDENCE=1. Verify every capture records the PR head and served /version.txt in /srv/agents/evidence/TASK-vd-game-layout-2/.
- [x] 3.2 Run pnpm build, pnpm test, client lint, pnpm typecheck:e2e, openspec validate --all --strict, git diff --check against the task base, and verify gzip bundle total ≤343,863 B. Record command results and deviations in the PR.

## Workflow follow-up

- Archive this OpenSpec change in the PR after independent review passes, then verify the archived exact head.
