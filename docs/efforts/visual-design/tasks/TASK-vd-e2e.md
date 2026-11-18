# Team Lead -> Engineer Task Handoff

```yaml
id: TASK-vd-e2e
revision: 1
effort: EFF-visual-design
project: economic-board-game
source_commit: TBD # main after TASK-vd-sound and TASK-vd-dialogs-followup merge
owner: team-lead
status: proposed
```

## Outcome

The effort's completion evidence exists and is reproducible:
- browser scenarios for chat, a mobile-viewport turn and the turn-order roll;
- screenshots of every screen next to the design frames;
- logo coverage;
- CI timing after the split;
- ROADMAP "Сделано" updated.

The known flaky wait for a disabled EndTurn is understood and fixed.

## Acceptance criteria

1. **Browser scenarios** in the `compose-browser` job (production stack):
   - **chat:** a message from one client appears in the other clients, and
     both see it after a reload; a spectator or eliminated member can send;
     a rejected message shows its reason;
   - **mobile turn** at 390x844: roll, buy, an auction with a bid, and
     building a house, all through the mobile navigation and bottom sheets;
   - **turn-order roll,** including a tie re-roll (use the seeded or fixture
     stack if a deterministic tie needs it).

   All stage 1-5 scenarios keep passing.
2. **Screenshots:** a Playwright script that captures every screen of
   handoff C3 and C4 at 1440x900 and 390x844 and places each next to the
   matching design frame, taken by opening the design files in Chromium as
   design.md describes.
   - Output: `/srv/agents/evidence/TASK-vd-e2e/screens/` plus an index page
     or README that lists each pair.
   - The script is committed so the set can be regenerated.
3. **Logo coverage:** a list of all 67 catalog companies with the logo set
   used (brand, geometric or monogram) and the recorded source, generated
   from the manifests by a committed script.
4. **CI timing:** the durations of `ci`, `compose-browser`,
   `compose-browser-fixtures` and `compose-browser-seeded` on the final
   head, against the 35-minute limit, with headroom stated.
5. **Flaky EndTurn wait:** investigate the wait for a disabled EndTurn
   (`stage3.spec.ts:330`, CI attempt 1 on afa786f; `compose.spec.ts:57`
   locally in TASK-vd-fsd):
   - state the root cause;
   - fix it with a condition-based wait on the authoritative state, not a
     longer timeout;
   - prove it with 20 repeated local runs of the affected specs.
6. **ROADMAP.md** "Сделано" gets the visual-design entry. No other ROADMAP
   change.
7. **No product code change** beyond `data-testid` hooks and test helpers.
   Any defect found goes to the Team Lead as a report, not a fix in this
   task.

## Scope and non-goals

In scope:
- `e2e/**`;
- evidence scripts;
- the CI workflow only if the new scenarios need a job assignment;
- `ROADMAP.md` "Сделано";
- `data-testid` hooks.

Not in scope:
- visual baselines or pixel-diff gating (a later phase);
- product fixes;
- production deploys.

## Canonical references

- `docs/efforts/visual-design.md` revision 2, "Completion evidence" and C12.
- `docs/efforts/visual-design/design.md` § "CI split", "Evidence plan".

## Dependencies

Starts after `TASK-vd-sound` merges, so the sound evidence and final
screens exist. The flaky-wait investigation (AC5) may start earlier as its
own PR if an Engineer slot is free.

## Required workflow

Explore -> Propose (OpenSpec change if a spec changes; otherwise a short plan
in the report) -> Team Lead approval -> Apply -> Verify -> PR -> start the
independent review yourself -> review fixes.

## Required checks

- `pnpm build`, `pnpm test`;
- the browser jobs locally where possible;
- `openspec validate --all --strict`;
- `git diff --check <base> HEAD`;
- green CI (all four jobs) on the PR head.

## Escalation conditions

- A browser job would exceed 35 minutes.
- A screen in C3 or C4 has no reachable state on the available stacks.

## Deliverables

- branch `agent/task-vd-e2e`, the PR and CI evidence;
- screenshots with the index, the logo coverage list, the CI timing table,
  and the flaky-wait root cause;
- the independent review report.

The Engineer accepts the exact revision before editing.
