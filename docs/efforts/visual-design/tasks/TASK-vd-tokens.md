# Team Lead -> Engineer Task Handoff

```yaml
id: TASK-vd-tokens
revision: 1
effort: EFF-visual-design
project: economic-board-game
source_commit: c848122 # main after TASK-vd-fsd (#75) and TASK-vd-logos-set (#78)
owner: team-lead
status: proposed
```

## Outcome

The client has the design system and Russian text:
- Tailwind CSS 4 with the design tokens;
- Reka UI;
- self-hosted Inter and Unbounded;
- the `shared/ui` primitives;
- every UI string translated into Russian, with `ru` as the default locale.

Existing screens keep their structure. They switch to the new primitives
and tokens only where that is mechanical. The screen-by-screen restyle
follows in later tasks.

## Acceptance criteria

1. **Stack** per the design § "Stack and versions":
   - `tailwindcss` 4.1 + `@tailwindcss/vite`;
   - `reka-ui` 2.x;
   - `@fontsource-variable/inter` and `@fontsource-variable/unbounded`
     (latin + cyrillic subsets only, imported once in `app/`);
   - versions published at least two weeks earlier, pinned exactly.
2. **Tokens.**
   - `shared/config/tokens.css` defines every token of the desktop design's
     "Дизайн-система и токены" frame:
     - surfaces, text, accent and semantic colors;
     - the action, auction, casino and chance gradients;
     - the group gradients M1-M8, logistics and energy;
     - six player colors;
     - radii, shadows, spacing;
     - the display and UI fonts.
   - Tailwind `@theme` maps them to utilities.
   - `shared/config/pixi-theme.ts` exposes the same values to PixiJS.
   - Read the values by rendering `docs/design/ui-mvp-v1.html` (a
     self-unpacking bundle) in Chromium and reading the computed styles; the
     mobile file confirms them. Record the extraction script and its output
     in the evidence.
3. **Lint and contrast.**
   - A lint rule rejects raw hex/rgb colors in `.vue` and `.ts` outside
     `shared/config`.
   - A unit test checks that the text tokens reach WCAG AA (4.5:1) against
     their surfaces.
4. **`shared/ui` primitives**, mapped per the design § "Component
   inventory":
   - `Button` (primary gradient, secondary, danger, disabled with a visible
     reason);
   - `Badge`, `Money` and `Countdown` (tabular numbers);
   - `ResponsiveDialog` (a Reka Dialog on desktop and a bottom Sheet below
     1024 px);
   - `AlertDialog`, `Tooltip`, `Popover`, `Tabs`, `Toast` with a provider in
     `app/`;
   - each with a component test covering focus trap and Esc where relevant.
5. **Russian by default.**
   - `ru.json` translates every key; `ru` becomes the default and fallback.
   - `en.json` stays as a second locale.
   - Texts follow the design wording where the design shows them.
   - The locale selector stays hidden while only `ru` and `en` exist and the
     owner has not asked for a switch. Keep the code path.
   - Money and time formatting follows the locale (thin-space grouping for
     `ru`).
   - Browser and component tests move to the Russian texts.
6. **Deferred items** from REV-vd-fsd-3:
   - RVW-008: align the shared-segment lint with the canonical design (any
     acyclic import through `index.ts`; `shared/i18n` imports no other
     segment);
   - keep the lint probes.
7. **Mechanical adoption only.** Existing components replace raw colors and
   buttons with the tokens and primitives where the change is mechanical.
   - Each screen still works and shows disabled reasons.
   - No layout redesign (that is the screen tasks).
   - Staging stays playable.
8. **Bundle.** Report the JS and CSS gzip sizes against the baseline from
   `TASK-vd-fsd`. The budget (design § "Bundle size") is JS +90 KB and CSS
   ≤ 40 KB gzip in total for the effort, so this task should use at most
   about half of it.
9. **Evidence.** A dev-only design-system page (route `?ds` in dev builds
   only), screenshotted at 1440x900 and 390x844 next to the design's token
   frame, saved in `/srv/agents/evidence/TASK-vd-tokens/`.

## Scope and non-goals

In scope:
- `apps/client/**`;
- `e2e/**` (text updates only);
- the client lint configuration;
- the OpenSpec client deltas.

Not in scope: board rendering, screen layouts, chat, sound, server,
protocol.

## Canonical references

- `docs/efforts/visual-design.md` revision 2, C2, C8 and C11.
- `docs/efforts/visual-design/design.md` § "Stack", "Tokens and theming",
  "Component inventory", "Breakpoints", "Language and localization",
  "Bundle size".
- `docs/design/ui-mvp-v1.html`, `docs/design/ui-mvp-mobile-v1.html`,
  `docs/design/ui-brief.md` § 11.

## Dependencies

None. It starts now, in parallel with `TASK-vd-chat`, which touches
protocol, server and the client's chat/event entities only. If both edit
`shared/api`, the second to merge rebases.

## Required workflow

Explore -> Propose (OpenSpec change; `agentctl engineer report --wake`) ->
Team Lead approval -> Apply in a fresh context -> Verify -> PR -> start the
independent review yourself -> review fixes. Archive the OpenSpec change in
the PR once review passes.

## Required checks

- `pnpm build`, `pnpm test`, the client bundle, the client lint;
- `openspec validate --all --strict`;
- `git diff --check <base> HEAD`;
- green CI (all jobs) on the PR head.

## Escalation conditions

- An owner-visible choice the designs leave open. Include a screenshot of
  the options.
- A paid font or asset.
- A token that cannot reach AA contrast as designed.

## Deliverables

- the OpenSpec change, code and tests;
- branch `agent/task-vd-tokens`, the PR and CI evidence;
- the token extraction, screenshots and bundle sizes in the evidence
  directory;
- the independent review report.

The Engineer accepts the exact revision before editing.
