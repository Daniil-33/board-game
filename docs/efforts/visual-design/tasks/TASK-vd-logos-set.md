# Team Lead -> Engineer Task Handoff

```yaml
id: TASK-vd-logos-set
revision: 1
effort: EFF-visual-design
project: economic-board-game
source_commit: 179d86d # main after TASK-vd-logos (PR #74)
owner: team-lead
status: proposed
```

## Outcome

The owner-commissioned logo set (all 67 catalog ids, light and dark
variants) replaces the 12 scraped logos in
`packages/game-core/src/catalog/logos/`. The manifest records it as the
source, and the font license ships with the files.

## Acceptance criteria

1. **Files.** Copy every `<id>.svg` and `<id>-dark.svg` from
   `/srv/agents/design-references/board-game/ua-1-geometric-logos/logos/`
   into `packages/game-core/src/catalog/logos/`:
   - 134 files for 67 ids;
   - every earlier scraped file is removed, including `media-1.png`;
   - the files are not modified (byte-identical; record the sha256 values in
     the evidence).
2. **License.** `FONT-LICENSE.txt` from the set is copied next to them
   unchanged. A short `README.md` in the logos directory states:
   - the origin: "owner-commissioned set, 2026-11-17";
   - that the letter geometry is derived from DejaVu Sans Bold under the
     included license;
   - the naming convention: `<id>.svg` for light backgrounds and
     `<id>-dark.svg` for dark ones.
3. **Manifest `logos.json`.** One entry per catalog id:
   `{ file: "<id>.svg", darkFile: "<id>-dark.svg", monogram, source:
   "owner-commissioned set, 2026-11-17", license: "see FONT-LICENSE.txt" }`.
   - `monogram` comes from the set's `logos.json`.
   - The earlier per-company URLs and reasons are dropped.
   - `microfinance-4` keeps its МГ mark; it is final (owner decision).
4. **Validation test** (`catalog-logos.test.ts`) updated to the design §
   "Logos":
   - every catalog id has an entry with an existing `file` and `darkFile`;
   - no file exists without an entry (the `-dark` variants included);
   - SVG at most 40 KB;
   - SVG safety: no script, no `on*` attributes, no external references, no
     `<image>`;
   - `viewBox` is `0 0 64 64`;
   - `FONT-LICENSE.txt` is present.
5. **Code boundary.** game-core code does not import the files. The client
   loader and dark/light selection belong to `TASK-vd-board`; do not touch
   `apps/client`.

## Scope and non-goals

In scope: `packages/game-core/src/catalog/logos/**` and its test.

Not in scope: client rendering, the catalog `ua-1.json`, any edit of the
SVGs.

## Canonical references

- `docs/efforts/visual-design.md` revision 2, C6.
- `docs/efforts/visual-design/design.md` § "Logos".
- The set's `README.md` and `logos.json`.

## Dependencies

None. It runs in parallel with `TASK-vd-fsd`, which touches only
`apps/client`.

## Required workflow

Short plan (`agentctl engineer report --wake`) -> Team Lead approval ->
Apply -> Verify -> PR -> start the independent review yourself -> report.

## Required checks

- `pnpm build`, `pnpm test`;
- `git diff --check <base> HEAD`;
- green CI (all jobs) on the PR head.

## Deliverables

- branch `agent/task-vd-logos-set`, the PR and CI evidence;
- sha256 list in `/srv/agents/evidence/TASK-vd-logos-set/`;
- the independent review report.

The Engineer accepts the exact revision before editing.
