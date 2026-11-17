# Team Lead -> Engineer Task Handoff

```yaml
id: TASK-s5-client
revision: 1
effort: EFF-stage-5-mortgage-debts-bankruptcy
project: economic-board-game
source_commit: fb625a1 # main after TASK-s5-core-debts (PR #61)
owner: team-lead
status: proposed
```

## Outcome

`apps/client` lets players:
- mortgage and redeem;
- see mortgage state and terms;
- see every liquidation and bankruptcy;
- keep watching after elimination;
- see the game result, also after a reload.

The PixiJS board marks mortgaged cells. This is functional only; visual
design is stage 8.

## Acceptance criteria

Product (handoff revision 2, C12-C13; design § "Client"):

1. **Controls.** For the viewer's own assets, the asset card has Mortgage and
   Redeem controls.
   - Their enablement comes from game-core's `mortgageLegality` /
     `redeemLegality`.
   - A disabled control shows the reason, one message per error code.
   - The labels show the advance and the redeem amount.
   - During the viewer's own open rent, Mortgage and Sell stay available and
     Redeem/Build show `RENT_PENDING`.
2. **Mortgage state.** The asset card shows "mortgaged" and `remainingLaps`
   (plus who still has to move this lap). A mortgaged asset quotes rent 0.
3. **Liquidation summary.** Every viewer gets a summary from
   `LiquidationApplied`:
   - the payer, the creditor and the debt;
   - each step in order (tier, mortgage or house sale, asset, amount);
   - the total raised and the payment.

   A bankruptcy notice comes from `PlayerBankrupt` (debt, paid, written
   off), together with the freed assets.
4. **Elimination screen.** For the eliminated viewer, showing the reason
   (`resigned` / `bankrupt`). They keep a read-only view of the game.
5. **Game-over screen.** It renders from `view.result`: the winner, the
   elimination order with reasons and times, and the final balances. It
   survives a reload. No game controls remain.
6. **PixiJS:** a mortgage marker per mortgaged cell. State always renders
   from the view, and animations never block it.
7. Rejected commands show their `Ack` error. No outcome is computed locally
   beyond the shared helpers.

Technical proof:

8. Component tests:
   - control enablement and every reason message;
   - advance and redeem labels;
   - mortgage state and term display;
   - the liquidation summary for each step kind and tier;
   - the bankruptcy notice;
   - the elimination screen per reason;
   - the game-over screen from a view (and after a remount);
   - mortgage markers.
9. A mock server scripted through mortgage, redeem, expiry, liquidation,
   bankruptcy and game end.
10. Fixtures follow `PROTOCOL_VERSION`, with no literal version.
11. `pnpm build`, `pnpm test`, the client bundle. Mock screenshots go to
    `/srv/agents/evidence/TASK-s5-client/` and are never committed.

## Scope and non-goals

In scope: `apps/client/**`, the OpenSpec client delta.

Not in scope: server, protocol and core changes; visual design and
localization; Playwright.

## Canonical references

- `docs/efforts/stage-5-mortgage-debts-bankruptcy.md` revision 2.
- `docs/efforts/stage-5-mortgage-debts-bankruptcy/design.md` § "Client",
  "Projection", "Liquidation order" (events).
- `openspec/specs/client/*`; the stage 4 client (asset card, rent line).

## Constraints

- Render only from the server view and `Ack`.
- Production code imports game-core only for types and pure helpers.
- Frames go through `@game/protocol` decoders.
- UI strings stay in English, consistent with the existing client
  (localization is stage 8).

## Dependencies

Starts after `TASK-s5-core-debts` merges, in parallel with `TASK-s5-server`
(which bumps `PROTOCOL_VERSION` to 5). Do not edit `packages/protocol`.
Merges after the server and rebases.

## Delegated decisions

Component structure, layout, marker style, reason texts and test helpers.

## Required workflow

Explore -> Propose (OpenSpec change; `agentctl engineer report --wake`) ->
Team Lead approval -> Apply -> Verify -> PR -> start the independent review
yourself -> review fixes. Archive the OpenSpec change in the PR once review
passes.

## Required checks

- `pnpm build`, `pnpm test`, the client bundle;
- `openspec validate --all --strict`;
- `git diff --check <base> HEAD` over the committed range (not the working
  tree);
- green CI (all jobs).

## Escalation conditions

- Missing view data.
- A product question about what to show.
- A needed protocol or core change.

## Deliverables

- the OpenSpec change, code and tests;
- branch `agent/task-s5-client`, the PR and CI evidence;
- screenshots in the evidence directory;
- the independent review report;
- residual risks.

The Engineer accepts the exact revision before editing. A material change
creates a new revision.
