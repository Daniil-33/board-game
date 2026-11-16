# Team Lead -> Engineer Task Handoff

```yaml
id: TASK-s4-client
revision: 2
effort: EFF-stage-4-rent-building
project: economic-board-game
source_commit: 7f5f174 # main after TASK-s4-core (PR #51)
owner: team-lead
status: proposed
```

## Outcome

`apps/client` lets players:
- pay rent;
- build and sell houses with reasons for disabled controls;
- see houses, rent quotes and the rent settlement.

The PixiJS board shows houses and animates rent payments.

## Acceptance criteria

Product (effort handoff C9, C10; visual design is stage 8):

1. While `view.rent` names the viewer as payer, they get a "Pay rent"
   action showing the amount and the owner. Every viewer sees the open
   settlement (payer, owner, asset, amount; energy also shows the dice sum).
2. The asset card shows the owner, the houses (0-4) and the current rent
   quote. Energy is shown as a formula/per-point rate from the quote,
   computed with game-core's display helper.
3. For the viewer's own buildable assets, the asset card has Build and Sell
   controls:
   - their enablement comes from game-core's `buildLegality` /
     `saleLegality`;
   - a disabled control shows the reason as text, one message per error
     code;
   - the build control shows the cost and the sale control the refund.
4. PixiJS: house markers (1-4) on each cell. On `RentPaid`, a simple
   animation shows the amount from payer to owner. State always renders
   from the view; the animation is the only event-driven element and is
   skipped on reload.
5. Turn controls follow the view. The settlement doesn't block `EndTurn`
   (which pays automatically), and the UI says so.
6. Rejected commands show their `Ack` error text. No outcome is computed
   locally beyond the shared display helpers.

Technical proof:

7. Component tests:
   - the pay action per viewer role;
   - the settlement line;
   - build/sell enablement and each reason message;
   - cost and refund labels;
   - the rent quote display for all three kinds;
   - house markers;
   - the animation trigger only on a new `RentPaid`.
8. A mock server scripted through rent payment, auto-payment at end of
   turn, build, an illegal build, and sell.
9. Fixtures follow `PROTOCOL_VERSION` (no literal version).
10. `pnpm build`, `pnpm test`, the client bundle. Mock screenshots in
    `/srv/agents/evidence/TASK-s4-client/` (never committed).

## Revision 2 addition: bonus-turn build quota (owner decision)

Owner decision 2026-11-16 (handoff revision 2, docs PR #52): a double's
bonus turn is a NEW turn and allows one more house. The build counter
resets at the start of every turn, bonus turns included.

Deliver this FIRST, as a separate small PR on branch
`agent/task-s4-core-bonus-quota` from current main:

- `packages/game-core`: `startTurn` gives every turn the full build quota.
  Selling still never replenishes it.
- Replace the merged test "bonus inherits ... builds" with tests showing:
  - a bonus turn resets the quota;
  - one house can be built in the regular turn and another in the bonus
    turn;
  - selling does not replenish the quota.
- Update the engine spec and the stage 4 design wording (a short OpenSpec
  change, archived in the PR).
- Run the checks below, get an independent review and green CI, then report
  it for the Team Lead merge.
- Then continue the client work on top of the merged fix. The client shows
  the quota from the view and never computes it.

## Scope and non-goals

In scope: `apps/client/**`, the OpenSpec client delta.

Not in scope: server or protocol changes, visual design beyond a clean
usable layout, Playwright.

## Canonical references

- `docs/efforts/stage-4-rent-building.md` revision 1.
- `docs/efforts/stage-4-rent-building/design.md` § "Client",
  § "Projection".
- `openspec/specs/client/*`.

## Constraints and invariants

- The client renders only from the server view and the `Ack`.
- Production code imports game-core only for types and pure display/legality
  helpers.
- Frames go through `@game/protocol` decoders.

## Dependencies

Starts after `TASK-s4-core` merges, in parallel with `TASK-s4-server`
(which bumps `PROTOCOL_VERSION` to 4). Do not edit `packages/protocol`. The
client merges after the server and rebases.

## Delegated decisions

Component structure, layout, marker style, reason texts (Russian UI text,
consistent with existing strings), test helpers.

## Required workflow

Explore -> Propose (OpenSpec change, `agentctl engineer report --wake`) ->
Team Lead approval -> Apply -> Verify -> PR -> start the independent review
yourself -> review fixes. Archive the OpenSpec change in the PR once review
passes.

## Required checks

- `pnpm build`, `pnpm test`, the client bundle;
- `openspec validate --all --strict`;
- `git diff --check`;
- green CI (all jobs).

## Escalation conditions

- Missing view data for a required display.
- A product question about what to show.
- A needed protocol or core change.

## Revision history

- 1: initial.
- 2: separate core PR for the owner's bonus-turn build-quota decision.

## Deliverables

- the OpenSpec change, code and tests;
- branch `agent/task-s4-client`, the PR and CI evidence;
- screenshots in the evidence directory;
- the independent review report;
- residual risks.

The Engineer accepts the exact revision before editing. A material change
creates a new revision.
