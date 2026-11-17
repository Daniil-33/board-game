# Team Lead -> Engineer Task Handoff

```yaml
id: TASK-vd-fsd
revision: 1
effort: EFF-visual-design
project: economic-board-game
source_commit: e893fb4 # main; effort handoff in docs PR #72 (revision 2)
owner: team-lead
status: proposed
```

## Outcome

`apps/client` is restructured into the Feature-Sliced layout of the design,
with **identical behavior and look**. It also gains:
- the i18n plumbing, with the existing English strings moved into keys;
- stable `data-testid` hooks, used by the browser specs;
- a layer-boundary check in CI;
- a recorded bundle-size baseline.

## Acceptance criteria

1. **Layout** per the design § "Feature-Sliced layout":
   - the layers `app`, `pages`, `widgets`, `features`, `entities`, `shared`;
   - each slice has a public `index.ts`;
   - the existing modules move as the design's mapping says, and no old
     directory remains.
2. **Boundary check.** The import rule (a layer imports only from lower
   layers, and only through slice public APIs) is enforced in CI with
   `eslint-plugin-boundaries` or `dependency-cruiser`, and fails on a
   violation.
3. **Behavior identical:**
   - every existing client unit and component test passes, with only import
     paths changed;
   - the mock server scenarios run;
   - stage 1-5 browser specs pass;
   - no visual or text change is intended.
4. **i18n plumbing** per the design § "Language and localization":
   - `vue-i18n` (`legacy: false`) with JSON locales auto-discovered from
     `shared/i18n/locales/`;
   - every existing UI string, including the error-code reason maps, moves
     to keys in `locales/en.json` **unchanged in text**, with `en` as the
     current default;
   - an empty `ru.json` skeleton is allowed; the tokens task translates and
     switches the default to `ru`;
   - `shared/lib/format` wraps `Intl` for money and times.
   - **Enforcement:** the `no-raw-text` and missing-key lint run in CI, plus
     a unit test that keys used equal the keys defined.
5. **Test hooks.** Every element the browser specs or component tests
   select gets a `data-testid`, and `e2e/**` uses them instead of text or
   structure selectors where it relied on markup.
6. **Sound slot:** `shared/sound` with a no-op `playSound` and an empty
   `SoundId`, unused.
7. **Bundle baseline.** Record the `vite build` JS and CSS gzip sizes before
   and after in the PR body and in the evidence directory. After must be
   within +15 KB gzip of before; vue-i18n is the expected growth.

## Scope and non-goals

In scope:
- `apps/client/**`;
- `e2e/**` (selectors only);
- the client lint configuration and the CI lint step;
- the OpenSpec client delta (structure and i18n requirements).

Not in scope:
- Tailwind, Reka, tokens, fonts, any restyle or Russian text;
- server, protocol, core.

## Canonical references

- `docs/efforts/visual-design.md` **revision 2** (docs PR #72, branch
  `docs/visual-design-handoff`, until merged).
- `docs/efforts/visual-design/design.md` (docs PR on branch
  `docs/visual-design-tl-design`): § "Stack", "Feature-Sliced layout",
  "Language and localization", "Bundle size".
- `openspec/specs/client/*`.

## Constraints

- One PR, but structured as reviewable commits: (a) moves only, (b) the
  boundary check, (c) i18n, (d) test hooks.
- No behavior change.
- Staging stays playable.

## Dependencies

None; it starts now. It runs in parallel with `TASK-vd-logos`, which
touches only game-core catalog data.

## Delegated decisions

- Slice names within the layout, and which component is a widget or a
  feature.
- The lint tool choice.
- The key naming scheme. Document it in `shared/i18n/README.md`.

## Required workflow

Explore -> Propose (OpenSpec change; `agentctl engineer report --wake`) ->
Team Lead approval -> Apply in a fresh context -> Verify -> PR -> start the
independent review yourself -> review fixes. Archive the OpenSpec change in
the PR once review passes.

## Required checks

- `pnpm build`, `pnpm test`, the client bundle, the new lint;
- `openspec validate --all --strict`;
- `git diff --check <base> HEAD`;
- green CI (all jobs) on the PR head.

## Escalation conditions

- A behavior difference you cannot avoid.
- A circular dependency that needs a design change.
- Bundle growth beyond the bound.

## Deliverables

- the OpenSpec change, code and tests;
- branch `agent/task-vd-fsd`, the PR and CI evidence;
- bundle sizes in `/srv/agents/evidence/TASK-vd-fsd/`;
- the independent review report;
- residual risks.

The Engineer accepts the exact revision before editing.
