# Team Lead -> Engineer Task Handoff

```yaml
id: TASK-vd-logos
revision: 1
effort: EFF-visual-design
project: economic-board-game
source_commit: e893fb4 # main; effort handoff in docs PR #72 (revision 2)
owner: team-lead
status: proposed
```

## Outcome

Company logo files for the `ua-1` catalog are stored next to it, keyed by
company id, with each file's source recorded. A missing logo is simply
absent; the client then shows a monogram, which comes in the board task.

## Acceptance criteria

1. **Storage:** `packages/game-core/src/catalog/logos/<companyId>.svg`
   (preferred) or `.png`. The design § "Logos" sets the limits: a PNG is
   at most 256 px on the long side and 40 KB; an SVG is at most 40 KB,
   sanitized (no scripts, no external references, no event attributes).
2. **Manifest** `packages/game-core/src/catalog/logos/logos.json`:
   - it has an entry for **every** company id in `ua-1.json` (categories'
     companies, logistics, energy);
   - an entry is either `{ file, source, sourceUrl, license, retrievedAt }`
     or `{ file: null, reason }` (monogram);
   - `source` is one of: an official brand or press page of the company, or
     Wikimedia Commons;
   - if the source is unclear, use `file: null`.
3. **Validation test** (game-core, no runtime import of the files):
   - every catalog id has a manifest entry;
   - every file exists and every existing file has an entry;
   - size limits hold;
   - SVGs contain no `<script>`, no `on*=` attributes and no external
     `href` or `url()`.
4. **Coverage table** `/srv/agents/evidence/TASK-vd-logos/coverage.md`:
   company, logo or monogram, source URL and license.
5. **Code boundary.** game-core code does not import the logos; they are
   data only. The package build still works and does not ship them into the
   server bundle unnecessarily. If the build copies `src/catalog`, make sure
   it is harmless, or exclude the logos from it.

## Approach

- Prefer each company's official press/brand kit page or Wikimedia Commons
  (SVG).
- Record the exact URL and the license or usage statement as found.
  Trademark review is out of scope (it happens before public release).
- Optimize SVGs (`svgo`) and PNGs.
- Do not hotlink. Files are committed.

## Scope and non-goals

In scope:
- `packages/game-core/src/catalog/logos/**`;
- its test;
- the game-core build configuration only if needed for criterion 5.

Not in scope: client rendering (`TASK-vd-board`), the catalog content
(`ua-1.json`), trademark review.

## Canonical references

- `docs/efforts/visual-design.md` revision 2, C6.
- `docs/efforts/visual-design/design.md` § "Logos".
- `packages/game-core/src/catalog/ua-1.json`.

## Dependencies

None; it starts now, in parallel with `TASK-vd-fsd`.

## Delegated decisions

Which source to use per company; SVG or PNG; optimization tools.

## Required workflow

Explore -> short plan (`agentctl engineer report --wake`) -> Team Lead
approval -> Apply -> Verify -> PR -> start the independent review yourself
-> report.

## Required checks

- `pnpm build`, `pnpm test`;
- `git diff --check <base> HEAD`;
- green CI (all jobs) on the PR head.

## Escalation conditions

- A source that looks restricted beyond trademark (for example "no use
  without written permission"). Use a monogram and list it.
- Any company you cannot identify.

## Deliverables

- the files, the manifest and the test;
- branch `agent/task-vd-logos`, the PR and CI evidence;
- the coverage table;
- the independent review report.

The Engineer accepts the exact revision before editing.
