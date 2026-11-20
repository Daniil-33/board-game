# Team Lead -> Engineer Task Handoff

```yaml
id: TASK-vd-layout-polish
revision: 1
effort: EFF-visual-design
project: economic-board-game
source_commit: <main after TASK-vd-final-evidence merges>
owner: team-lead
status: proposed
```

## Outcome

The last desktop layout defects found in the TL's side-by-side review of the
final screenshot set are fixed, and the complete evidence set is regenerated at
this task's final head for the effort-complete resubmission (CTO gaps G1-G4).

## Defects (TL review of /srv/agents/evidence/TASK-vd-final-evidence/pairs/ at db2087d)

- **A. Below-the-board panels at 1440x900.**
  - `rent-shortfall-desktop`: the rent card "Рента к оплате" starts at the
    bottom edge, below the board.
  - `liquidation-desktop` and `elimination-desktop`: the "Расчёты по долгам"
    notices render below the board, the page scrolls, and the top bar is out
    of view.
  - Purchase and auction were already fixed this way (TASK-vd-game-layout-2,
    RVW-005).
- **B. Jail status and caption.**
  - `jail-attempt-status-desktop` shows no jail-attempt status.
  - The board-centre caption is hidden behind the journal panel: only
    "…yer 1" and "…авн" peek out at the edges.
- **C. Raw room ids as names.**
  - The lobby rows read "Комната r_slQ_EwheDmcBk0cgflrfAQ".
  - The waiting-room heading is "Комната r_Rsfe9s8Nk7oPeO5c_TKhJA".
  - The room name is a listed deviation (no projection field), but an internal
    id must not be shown as a name.
- **D. Elimination dialog** shows an unlabelled "0" under the player badge.

## Acceptance criteria

1. **Visible without scroll (A).** At 1440x900 and 1920x1080 the rent card
   and the debt, liquidation and bankruptcy notices are fully visible without
   page scroll, together with the top bar and the board's bottom row. Place
   them as the purchase and auction surfaces are placed (an opaque overlay
   card over the board centre, or the right column), with opaque defined
   tokens. Extend the existing game-layout browser assertions to cover the
   rent payer and a debt notice.
2. **Jail status and caption (B).**
   - The temporary-jail attempt status is visible to the jailed player and to
     observers, for example in the turn header ("В тюрьме · попытка 1 из 3").
     The denominator comes from three-attempt jail rule.
   - The board-centre caption never overlaps the journal: add a browser
     assertion that their bounding boxes do not intersect at 1440x900.
3. **Room label (C).**
   - Never display an internal room id or the access code as a name.
   - If the existing lobby or room payload supplies the creator's nickname, use
     "Комната <creator>" (en "<creator>'s room").
   - Otherwise use "Комната" with the member names, as the lobby already lists
     them, and a neutral waiting-room heading.
   - No protocol or server change. Keep the test ids.
4. **Elimination dialog (D).** Label the balance ("Баланс: 0" or the
   design's wording).
5. **Final evidence.**
   - Regenerate the complete pair set (at least the 37 pairs) at this task's
     final head, with the TASK-vd-final-evidence tooling, into
     `/srv/agents/evidence/TASK-vd-layout-polish/final/`. That includes the
     design frames, the blank guard, the manifests and the README index with
     the deviation list.
   - Look at every pair next to its frame yourself before the review request.
6. **No other change.** No token values, no protocol, server or game-core
   change. Bundle delta at most +2 KB at gzip level 9 against the base
   (headroom is about 4.4 KB).

## Scope and non-goals

In scope: the game page placement of the rent and debt surfaces, the turn
header (jail status), the board-centre caption and journal layout, the lobby
and room labels, the elimination dialog label, locale strings, tests, an
OpenSpec delta (archived in the PR, with mechanical archive reproduction), and
the evidence regeneration.

Not in scope: new visual redesigns beyond the defects above; casino, chance
and the final jail state (ROADMAP stage 6).

## Dependencies

Base: main after TASK-vd-final-evidence merges (it carries the capture
tooling).

## Escalation conditions

Ask the Team Lead before any of these:
- a room label that would need new data;
- a defect you find that is not listed here.

## Required workflow

Explore -> Apply in the same context (a small, bounded fix set; the TL records
why) -> Verify -> PR -> start the independent review yourself -> review fixes
-> archive -> exact-head review.

Before every push, read all four CI jobs' failures. Before every review
request, run `agentctl task show TASK-vd-layout-polish`.

**Do not merge.** The Team Lead merges through pr-merge-gate.

## Required checks

- `pnpm build`, `pnpm test`, client lint, `pnpm typecheck:e2e`;
- `openspec validate --all --strict`, plus the mechanical archive
  reproduction;
- `git diff --check`;
- CI 4/4 on the PR head;
- the bundle gate above.

## Deliverables

- branch `agent/task-vd-layout-polish`, the PR and CI evidence;
- `/srv/agents/evidence/TASK-vd-layout-polish/final/`;
- the independent review report.

The Engineer accepts the exact revision before editing.
