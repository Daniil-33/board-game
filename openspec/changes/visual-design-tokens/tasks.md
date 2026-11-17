# Tasks

## 1. Theme foundation

- [x] 1.1 Extract desktop computed token styles in Chromium, confirm mobile and save script/output in evidence; verify all design token categories are captured (design-system: Shared design tokens).
- [x] 1.2 Add exact eligible Tailwind package; verify installation and typecheck (design-system: Shared design tokens).
- [x] 1.3 Add exact eligible Tailwind Vite plugin; verify build and typecheck (design-system: Shared design tokens).
- [x] 1.4 Add exact eligible Inter variable font; verify only Latin and Cyrillic subsets are imported once (design-system: Shared design tokens).
- [x] 1.5 Add exact eligible Unbounded variable font; verify only Latin and Cyrillic subsets are imported once (design-system: Shared design tokens).
- [x] 1.6 Implement CSS tokens and Tailwind theme; test designated text/surface pairs for AA and escalate failures (design-system: Shared design tokens, Contrast and evidence).
- [x] 1.7 Implement Pixi theme adapter and verify values match computed CSS tokens (design-system: Shared design tokens).
- [x] 1.8 Enforce raw-color lint and retain positive and negative probes; run client lint (design-system: Shared design tokens).
- [x] 1.9 Correct shared-segment dependency lint and its probes; run client lint (structure: Enforced client boundaries).

## 2. Primitives

- [x] 2.1 Add exact eligible Reka dependency and verify installation and typecheck (design-system: Accessible shared primitives).
- [x] 2.2 Implement Button and disabled reason tests for desktop and mobile (design-system: Accessible shared primitives).
- [x] 2.3 Implement Badge and verify component rendering (design-system: Accessible shared primitives).
- [x] 2.4 Implement Money and verify tabular figures and locale formatting (design-system: Accessible shared primitives).
- [x] 2.5 Implement Countdown and verify tabular figures (design-system: Accessible shared primitives).
- [x] 2.6 Implement ResponsiveDialog and test breakpoint, focus trap and Escape (design-system: Accessible shared primitives).
- [x] 2.7 Implement AlertDialog and test focus trap and Escape (design-system: Accessible shared primitives).
- [x] 2.8 Implement Tooltip and test keyboard and Escape behavior (design-system: Accessible shared primitives).
- [x] 2.9 Implement Popover and test focus and Escape behavior (design-system: Accessible shared primitives).
- [x] 2.10 Implement Tabs and test keyboard navigation (design-system: Accessible shared primitives).
- [x] 2.11 Implement Toast and app provider and test announcement and dismissal (design-system: Accessible shared primitives).

## 3. Localization and adoption

- [x] 3.1 Translate every locale key, set Russian default/fallback, preserve English and hidden selector path; test parity and translated screens (localization: Discovered English locale, Complete unchanged English keys).
- [x] 3.2 Update Intl money and time wrappers and test Russian grouping and English formatting (localization: Shared locale formatting).
- [x] 3.3 Mechanically adopt shared tokens and controls in existing client screens; test existing interactions and disabled reasons (design-system: Shared design tokens, Accessible shared primitives).
- [ ] 3.4 Update browser and component text assertions and run affected tests (localization: Complete unchanged English keys).

## 4. Integration evidence

- [x] 4.1 Add dev-only design-system page and verify production excludes it; capture both viewport screenshots next to the reference frame in the evidence directory (design-system: Contrast and evidence).
- [ ] 4.2 Run build, unit tests, client lint, bundle and strict OpenSpec validation; compare gzip sizes with TASK-vd-fsd baseline and record evidence.
- [ ] 4.3 Inspect diff against the handoff, run git diff --check against base, and verify browser behavior and CI on the PR head.

## Workflow follow-up

- Obtain independent review and resolve findings; archive the change in the PR after review passes.
