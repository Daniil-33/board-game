# Team Lead -> Engineer Task Handoff

```yaml
id: TASK-vd-dialogs-followup
revision: 1
effort: EFF-visual-design
project: economic-board-game
source_commit: 5181edd # main after TASK-vd-game-dialogs (PR #89)
owner: team-lead
status: proposed
```

## Outcome

Close the review items left open when TASK-vd-game-dialogs merged (PR #89,
REV-vd-game-dialogs-2..5). Viewers who owe no rules response keep live,
non-modal visibility of purchases and auctions. Logistics rent schedules match
the group size. Browser helpers stop racing between clients. The canonical
spec wording lost in the archive is restored.

## Acceptance criteria

1. **Non-responders see a status, not a dialog (RVW-007, TL decision).**
   - Purchase: only the deciding player gets the non-dismissible
     `ResponsiveDialog`. Every other viewer sees an inline, non-modal
     `role="status"` purchase surface: who is deciding, the asset, its price
     and the countdown. Other players, eliminated players and spectators all
     count as other viewers.
   - Auction: on mobile, only the current responder gets the
     non-dismissible sheet. Every other viewer sees the inline
     `AuctionContent` (leader, bid, timer), on desktop and mobile. The sheet
     opens when the viewer becomes the responder.
   - No viewer gets an auto-opening or dismissible dialog for a decision
     they don't owe, so the dismiss-and-lose-visibility state is gone.
   - Tests: a bystander and an eliminated viewer, during a purchase and
     during a mobile auction:
     - have no `role="dialog"` or `aria-modal`;
     - see the live status;
     - can focus and type in `chat-input`.

     The responder-locked tests stay.
2. **Logistics rent tiers (TL item).** `rentTiers` lists logistics
   holdings `1..group size`, not always `1..4`. The parity test against
   `rentFor` stays green. No other core change.
3. **Browser sync (RVW-008).** In `e2e/compose.spec.ts` and
   `e2e/game-layout.spec.ts`, after each action, `resolvePrompts` and
   `endTurn` sync every client to the acting client's revision, as the
   `click` helper in `e2e/fixture-helpers.ts` does. They must not read the
   host's view right after another client acts.
4. **Spec wording (RVW-501).** Restore the "only from server-projected
   data" meaning in the canonical `openspec/specs/client/game-screen/spec.md`
   Asset inspection statement within the strict-validation length limit.
5. **No behaviour change otherwise.** Commands, timers, amounts and
   legality stay unchanged. The required responder stays locked exactly as
   in PR #89.

## Scope and non-goals

In scope:
- `widgets/purchase-card`, `widgets/auction-panel`;
- `GameScreen` wiring if needed;
- `packages/game-core/src/rent.ts` `rentTiers` only, plus its test;
- the e2e helpers above;
- the client tests, the OpenSpec change and the canonical spec wording.

Not in scope:
- sound (TASK-vd-sound runs in parallel; avoid `shared/sound`, the top bar
  and settings);
- new surfaces or protocol, server or `StateView` changes.

## Canonical references

- `/srv/agent-runtime/state/reviews/REV-vd-game-dialogs-{2,3,4,5}-report.md`
  (RVW-007, RVW-008, RVW-501).
- `openspec/specs/client/game-screen/spec.md`: purchase decision display,
  decision surface accessibility, chat requirement.
- `docs/efforts/visual-design/design.md` § Bundle size.

## Dependencies

Base: main 5181edd. Runs in parallel with TASK-vd-sound. Both must merge
before TASK-vd-e2e starts.

## Required workflow

Explore -> Propose (OpenSpec change; `agentctl engineer report --wake`) ->
Team Lead approval -> Apply in a fresh context -> Verify -> PR -> start the
independent review yourself -> review fixes. Archive the OpenSpec change in
the PR once review passes.

## Required checks

- `pnpm build`, `pnpm test`, lint, `pnpm typecheck:e2e`;
- `openspec validate --all --strict`;
- `git diff --check <base> HEAD`;
- the affected browser specs run locally in Compose;
- green CI (all four jobs) on the PR head;
- a per-chunk JS gzip table against 5181edd. Total JS must stay at or below
  +85 KB over the 253,863-byte baseline. Main is +81,963.

## Escalation conditions

- Any need to change protocol, server or `StateView`.
- Total JS above +85 KB.

## Deliverables

- branch `agent/task-vd-dialogs-followup`, the PR and CI evidence;
- 1440x900 and 390x844 captures of the bystander purchase and the mobile
  auction status in `/srv/agents/evidence/TASK-vd-dialogs-followup/`;
- the independent review report.

The Engineer accepts the exact revision before editing.
