# Team Lead -> Engineer Task Handoff

```yaml
id: TASK-s6-e2e
revision: 1
effort: EFF-stage-6-special-cells
project: economic-board-game
source_commit: 15dfb73 # main after TASK-s6-client (PR #120); rebase on current main before the PR
owner: team-lead
status: proposed
```

## Outcome

The handoff's completion evidence exists and is green on `main`:
- the seven 3-client browser scenarios with seeded or fixture dice;
- the app/design pairs for the stage 6 surfaces at 1440x900 and 390x844;
- the ROADMAP "Сделано" update.

After this task the Team Lead can send effort-complete.

## Acceptance criteria

Product (handoff § "Completion evidence", C1-C19):

1. **Browser scenarios.** Each runs with 3 clients, all clients assert what they see, and dice and draws are seeded or from fixtures:
   1. **Casino win and casino loss.** Both are visible to all players: the result shown and the balances changed.
   2. **Chance cards.** A positive card and a negative card. The negative one is paid with **at least one liquidation step** (an auto mortgage or house sale) through `PayCharge` or turn closure.
   3. **"В тюрьму".** Landing on cell 30 sends the player to jail, with no bonus even after a double. A later roll releases the player by a double: they move, with no bonus.
   4. **Voluntary exit.** "Заплатить X и выйти": the fee is debited, then a normal roll (a double grants the usual bonus).
   5. **Third failed attempt.** The forced fee is paid before the move, then the player moves by that roll's sum.
   6. **Redeem lock.** A mortgage, then redeem is refused in the same turn (button disabled with "Выкуп доступен со следующего хода"). It is allowed in the next turn, **including a bonus turn**.
   7. **Server restart.** With a prisoner (attempts used) and a mortgage lock in place, the state is restored after a restart, and play continues under the final rules.

   Drive the game through the UI (`action(...)` and the stage-6 `data-testid`s from PR #120). Use raw websocket commands only where the scenario cannot be produced through the UI, and justify each one in the PR body.
2. **Design pairs.** App captures at 1440x900 and 390x844, beside frame `desktop-08-тюрьма-казино-шанс` (desktop), for the casino dialog, the chance card, the jail choice and the jail status.
   - Use the existing visual-evidence tooling (`scripts/` capture, the collector, the blank-image guard).
   - Captures come from a committed producer at the final head, with manifests at that head.
   - Mobile has no frame: label the pairs "nearest" and keep the PR #120 mobile deviation note.
   - Evidence lives outside the repo, in `/srv/agents/evidence/TASK-s6-e2e/`, with a README index.
3. **ROADMAP.** In `ROADMAP.md`, mark stage 6 under "Сделано" with the PRs (#115, #117, #120 and this one), in the existing style.

Technical proof:

4. **CI on the exact head**, all 4/4. Stage 6 scenarios that need seeded dice run in `compose-browser-seeded`; fixture-based ones run in `compose-browser-fixtures`. **Run the seeded job at least 5 times locally.** Any intermittent failure gets its root cause fixed, never a longer wait.
5. **Regression:** the stage 3-5 browser suites and `load-split.spec.ts` stay green. Bundle: no client code change is expected; if there is one, measure it by the TL method and keep it within 346,881 B.
6. `pnpm build`, `pnpm test`, client lint and `openspec validate --all --strict` pass.

## Scope and non-goals

In scope:
- `e2e/` specs and helpers;
- new named fixtures in `apps/server/src/test-fixtures.ts`;
- seeded-stack configuration if needed;
- `scripts/` evidence capture for the new surfaces;
- `ROADMAP.md`.

Not in scope:
- product behaviour changes (core, protocol, server, client UI). If a scenario exposes a product bug, STOP and report it with evidence. Do not fix it inside this task.

## Canonical references

- `docs/efforts/stage-6-special-cells.md` rev 1, § "Completion evidence".
- `docs/efforts/stage-6-special-cells/design.md`.
- PR #120: test ids, fixtures `jail-choice`, `casino-decision`, `open-charge`, `pre-roll-chance`, `redeem-locked`, and the mobile deviation note.
- Evidence tooling from the visual-design effort (`scripts/README.md`).
- Seed 129 stream notes (PR #117).

## Constraints and invariants

- Deterministic: seeded streams or fixtures. No sleeps standing in for state waits.
- A seed or fixture is chosen to reach a scenario's subject, never to dodge a cell.
- **Records rule (CTO):** handoffs, archived OpenSpec changes and earlier briefs change only by a new revision, never by a scrub.
  - The PR body includes `git diff 15dfb7317c4ad3db9d4c1fb460cc5e79ec60b48c HEAD -- docs/efforts openspec/changes/archive ':(exclude,glob)openspec/changes/archive/*-s6-e2e/**'` with an empty output.
  - `ROADMAP.md` is a current document and may change.

## Dependencies

- Upstream: TASK-s6-client, merged as `15dfb73`.
- This is the last task of the effort.

## Delegated decisions

The Engineer decides:
- scenario file layout;
- seeds versus fixtures per scenario;
- the helper structure.

Return to the TL:
- a product bug;
- a scenario that cannot be reached deterministically;
- any change to an existing browser test (stage 3-5 or stage6-client-smoke).

## Required workflow

1. Explore.
2. Propose the OpenSpec change `s6-e2e`, if the e2e scenarios are tracked in specs as for earlier stages; otherwise say why none is needed.
3. Apply in a fresh context after TL approval.
4. Verify.
5. Open the PR.
6. Independent review; the request requires the full 40-char head SHA.
7. Review fixes.

**Do not merge.**

## Required checks

Criteria 4-6. The PR body includes:
- a scenario → spec:line → CI job table;
- the evidence index path;
- the seeded run count;
- the records-diff output.

## Escalation conditions

Escalate to the TL if:
- a product bug is found;
- a nondeterministic scenario has no deterministic fix;
- an existing browser test must change;
- a CI job time grows past ~15 minutes.

## Deliverables

- The branch `agent/task-s6-e2e` and its PR.
- The evidence at `/srv/agents/evidence/TASK-s6-e2e/`.
- The independent review report.
- Residual risks.
