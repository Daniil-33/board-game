# Team Lead -> Engineer Task Handoff

```yaml
id: TASK-s3-client
revision: 1
effort: EFF-stage-3-purchase-auction
project: economic-board-game
source_commit: <main after TASK-s3-core merges; set at delivery>
owner: team-lead
status: proposed
```

## Outcome

`apps/client` lets players buy or auction a free asset and take part in the
auction, and shows ownership: a Vue purchase dialog, a Vue auction panel with
the 10 s response timer, owner markers on the PixiJS board, and the owner in
the asset card.

## Acceptance criteria

Product (effort handoff C12; visual design is stage 8):

1. Purchase dialog for the landing player while `view.purchase` names them:
   asset, price, own balance; Buy (disabled when balance < price) and Start
   auction. Other viewers see who is deciding.
2. Auction panel for every viewer while `view.auction` exists: asset, start
   bid, step, leading bid and leader, passed players, current responder and a
   timer computed from `responseDeadline`. The responder gets a Bid button
   showing the next amount (start bid, else leading bid + step; disabled when
   above own balance) and Pass; everyone else sees
   the panel read-only.
3. Owner marker on owned cells (player colour); the asset card shows the
   owner or "free".
4. Turn controls follow the view: Roll/End turn disabled during an auction;
   the turn timer shows "paused" while `turn.pausedRemainingMs` is set.
5. Rejected commands show their `Ack` error; no outcome computed locally.

Technical proof:

6. Component tests for dialog enablement, panel per viewer role, timer from
   deadline, next-bid amount and its enablement, owner marker and card owner;
   mock server
   scripted through a decision, an auction with outbid/pass/timeout, and an
   unsold auction; the shown next amount matches the view.
7. Test fixtures follow `PROTOCOL_VERSION` (no literal version).
8. `pnpm build`, `pnpm test`, `vite build`; mock screenshots of dialog,
   auction panel and owner marker kept in `/srv/agents/evidence/TASK-s3-client/`
   (never committed).

## Scope and non-goals

In scope: `apps/client/**`, OpenSpec client delta.

Not in scope: server or protocol changes, rent/building UI, styling beyond a
clean usable layout, Playwright (e2e task).

## Canonical references

- `docs/efforts/stage-3-purchase-auction.md` revision 2.
- `docs/efforts/stage-3-purchase-auction/design.md` § "Client", § "Core".
- `openspec/specs/client/*`.

## Constraints and invariants

The client renders only from the server view and `Ack`; it never decides
outcomes; production code imports game-core only for types and pure display
helpers (dev mock excepted). Frames go through `@game/protocol` decoders.

## Dependencies

Starts after `TASK-s3-core` merges; parallel with `TASK-s3-server`, which
bumps `PROTOCOL_VERSION` to 3. Do not edit `packages/protocol`.

## Delegated decisions

Component structure, layout, marker style, test helpers. Return to the Team
Lead before adding client-side rules or changing view consumption.

## Required workflow

Explore -> Propose (OpenSpec change, proposal checkpoint reported with
`agentctl engineer report --wake`) -> Team Lead approval -> Apply -> Verify ->
PR -> Review fixes. Archive the OpenSpec change in the PR once review passes.

## Required checks

`pnpm build`, `pnpm test`, `vite build`, `openspec validate --all --strict`,
`git diff --check`, green CI (both jobs).

## Escalation conditions

Missing view data for a required display; a product question about what to
show; a needed protocol or core change.

## Deliverables

OpenSpec change, code and tests, branch `agent/task-s3-client`, PR, CI
evidence, screenshots in the evidence directory, independent review report,
residual risks.

The Engineer accepts the exact revision before editing. A material change
creates a new revision.
