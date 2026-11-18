# Team Lead -> Engineer Task Handoff

```yaml
id: TASK-vd-load-split
revision: 1
effort: EFF-visual-design
project: economic-board-game
source_commit: TBD # main after TASK-vd-compression merges
owner: team-lead
status: proposed
```

## Outcome

The first load is small. Login, lobby and room do not download Pixi or board
code. Logos are optimized and requested only when a screen needs them. This
covers the rest of criterion 13 in `docs/efforts/visual-design.md` revision 3.

## Acceptance criteria

1. **Route split.** The game page loads as a lazy route chunk, together with
   its widgets, dialogs, board, Pixi and sound engine. Login, lobby and room
   download no Pixi or board code; prove it from the Vite manifest and from a
   network log of a login -> lobby -> room flow. The game screen still loads
   and reconnects correctly, including a direct reload on the game URL. All
   existing browser specs pass.
2. **Logo optimization.**
   - Optimize the brand logo set (light and dark) without visible change.
     Use SVGO with safe settings, plus manual fixes where needed.
   - No single logo file may be larger than 20 KB.
   - Report the whole set's size before and after.
   - List any logo that cannot meet the limit, with the reason.
   - Show "no visible change" with a rendered side-by-side or a pixel diff,
     to a stated tolerance, for every changed file.
   - The logo manifest test keeps passing.
3. **Only needed logos.** A screen requests only the logos it shows. Login
   and lobby request none unless they display one. The game screen requests
   the board's logos, not the full set twice. Show it with a network log.
4. **Bundle budget** (design.md § Bundle size; KB = 1000 B).
   - Report initial-route JS and lazy JS separately, per chunk, against the
     merge base.
   - The initial route (login) must shrink substantially. State the figure.
   - Total emitted JS stays within +90,000 B over 253,863.
5. **Staging evidence.** Record Lighthouse mobile (LCP, TBT, and TTI if
   available) and transferred bytes for login and for the game screen.
   Measure on staging before (= after TASK-vd-compression) and after this
   task. Run Lighthouse from the Playwright/Chromium container.

## Scope and non-goals

In scope:
- the client router and the page split;
- logo files and the logo URL resolver;
- the Vite config;
- tests, e2e specs that depend on load order, and the OpenSpec change.

Not in scope:
- edge or nginx config (done in TASK-vd-compression);
- a media service or CDN;
- new visuals;
- production deploy.

## Canonical references

- `docs/efforts/visual-design.md` revision 3, criterion 13.
- `docs/efforts/visual-design/design.md` § Bundle size, Logos.

## Dependencies

Starts after TASK-vd-compression merges. If TASK-vd-sound merged first,
include its engine in the lazy game chunk.

## Required workflow

Explore -> Propose (OpenSpec change; `agentctl engineer report --wake`) ->
Team Lead approval -> Apply in a fresh context -> Verify -> PR -> start the
independent review yourself -> review fixes. Archive the OpenSpec change in
the PR once review passes.

## Required checks

- `pnpm build`, `pnpm test`, lint, `pnpm typecheck:e2e`;
- `openspec validate --all --strict`;
- `git diff --check <base> HEAD`;
- green CI (all four jobs) on the PR head;
- evidence in `/srv/agents/evidence/TASK-vd-load-split/`.

## Escalation conditions

- A logo that needs a visible change to meet 20 KB. List it, keep the
  original, and ask.
- The game route cannot be split without a protocol or server change.

## Deliverables

- branch `agent/task-vd-load-split`, the PR and CI evidence;
- logo before and after sizes and diffs;
- the bundle tables;
- the Lighthouse before and after report;
- the independent review report.

The Engineer accepts the exact revision before editing.
