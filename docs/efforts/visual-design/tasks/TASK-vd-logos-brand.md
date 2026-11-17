# Team Lead -> Engineer Task Handoff

```yaml
id: TASK-vd-logos-brand
revision: 1
effort: EFF-visual-design
project: economic-board-game
source_commit: TBD # main after TASK-vd-chat PR #80
owner: team-lead
status: proposed
```

## Outcome

Two logo sets live side by side:
- the owner's v2 brand icons, the default **brand** set;
- the v1 **geometric** set from PR #78, kept as the fallback.

One runtime configuration switch selects the set. The client loads logos
lazily as URLs and never inlines them in JS. This task also adds the client
logo resolver, so `TASK-vd-board` and the asset lists use it.

## Acceptance criteria

1. **Layout.**
   - `packages/game-core/src/catalog/logos/geometric/` holds the v1 files
     moved unchanged (byte-identical), with their `logos.json`,
     `FONT-LICENSE.txt`, `README.md` and `.gitattributes`.
   - `packages/game-core/src/catalog/logos/brand/` holds the v2 files from
     `/srv/agents/design-references/board-game/ua-1-brand-icons-v2/logos/`,
     optimized with `svgo`. The optimization keeps the `viewBox` and does
     not change the rendered result; check this with a pixel comparison at
     64 px and 24 px against the originals, and keep the comparison in the
     evidence.
   - v2's `sources.md` and a `README.md` (origin: owner, 2026-11-17, v2
     brand icons; the construction types) ship next to the files.
2. **`microfinance-4`.** In the brand set it uses the v1 geometric icon
   (light and dark), copied, because v2 ships only a neutral placeholder.
   The manifest records it.
3. **Manifests.** Each set has a `logos.json` with one entry per catalog id.
   - The geometric set keeps today's five-field schema.
   - Brand set entries are `{ file, darkFile, source, construction,
     sourceRef }`, carrying v2's `source` URL and `construction` per id
     (`microfinance-4`: `source: "geometric fallback"`).
4. **Validation test** for both sets:
   - coverage of all 67 ids, light and dark;
   - no orphan files;
   - `viewBox` `0 0 64 64`;
   - SVG safety (no script, no `on*`, no external refs, no `<image>`);
   - a per-file size limit of 40 KB after svgo. If a traced file cannot
     reach 40 KB without visible change, raise its limit individually with a
     recorded reason; the total brand set is at most 1.2 MB.
5. **Client resolver** in `shared/lib/logos` (or `entities/asset`, per the
   FSD rules):
   - `logoUrl(companyId, { dark }) → string | null` for the active set;
   - built from `import.meta.glob` with `query: '?url'`;
   - Vite `build.assetsInlineLimit` must never inline logo files (use a
     function that returns `false` for the logo directories). Add a build
     check that the JS bundle contains no `data:image/svg` for logos;
   - unknown ids return `null`, so the caller shows the monogram.
6. **Switch.**
   - The runtime config (the existing `config.js` / `docker-entrypoint.d`
     mechanism) gains `logoSet: "brand" | "geometric"`, default `brand`.
   - The deployment env documents `LOGO_SET`.
   - Staging uses `brand`.
   - The production env file sets `geometric` until the owner clears
     trademark use. Agents do not deploy production.
7. **Bundle.** JS and CSS gzip stay within the effort budget, and logos add
   0 bytes to JS chunks. Report the total brand set size (raw and gzip).

## Scope and non-goals

In scope:
- `packages/game-core/src/catalog/logos/**` and its test;
- the client resolver and the Vite configuration;
- the runtime config script;
- the deployment env documentation and files;
- the OpenSpec deltas.

Not in scope: drawing logos on the board or in panels (`TASK-vd-board`
and the screen tasks call the resolver); trademark review.

## Canonical references

- `docs/efforts/visual-design.md` revision 2, C6.
- `docs/efforts/visual-design/design.md` § "Logos".
- `/srv/agents/design-references/board-game/ua-1-brand-icons-v2/README.md`,
  `sources.md`, `logos.json`, `validation.json`.

## Dependencies

Starts after `TASK-vd-chat` PR #80 merges (Engineer capacity). It runs in
parallel with `TASK-vd-tokens`; rebase if `vite.config.ts` conflicts.

## Required workflow

Short plan (`agentctl engineer report --wake`) -> Team Lead approval ->
Apply -> Verify -> PR -> start the independent review yourself -> report.
Do not open `preview.html`.

## Required checks

- `pnpm build`, `pnpm test`, the client bundle and lint;
- `git diff --check <base> HEAD`;
- green CI (all jobs) on the PR head.

## Deliverables

- branch `agent/task-vd-logos-brand`, the PR and CI evidence;
- svgo before/after sizes and the pixel comparison in
  `/srv/agents/evidence/TASK-vd-logos-brand/`;
- the independent review report.

The Engineer accepts the exact revision before editing.
