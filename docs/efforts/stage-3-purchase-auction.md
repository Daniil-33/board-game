# CTO -> Team Lead Effort Handoff

```yaml
id: EFF-stage-3-purchase-auction
revision: 1
project: economic-board-game
repo: github.com/Daniil-33/board-game
created_at: 2026-11-16T07:00:00Z
source_commit: 6dfadbf # plus the docs PR that adds this file
owner: cto
status: proposed
```

## Outcome

ROADMAP.md stage 3 "Покупка и аукцион": a player who lands on a free asset
buys it at its fixed price or sends it to an auction in which every active
player takes part. Ownership exists and is visible on the board. The change
runs through core, protocol, server and client on top of stage 2. Owned
assets bring no rent yet (stage 4).

## Expected behavior and acceptance criteria

Agreed with the owner. Sources: ROADMAP.md stage 3, GAME-BREAKDOWN.md
§ "Покупка и аукцион".

1. Landing on a free asset (monopoly, logistics or energy cell) opens a
   pending decision for the landing player inside the current turn: buy at the
   fixed price or start an auction.
2. Buy is allowed only if the player's balance covers the fixed price (no
   credit in MVP). The price is debited to the bank and the player becomes the
   owner. A player who cannot afford it may still start the auction.
3. If the turn ends without a decision (`EndTurn` or turn deadline), the
   auction starts automatically; after it the mandatory settlement completes
   and the turn closes.
4. Auction amounts: start bid `Q(60% × price)`, step `Q(5% × price)`; both are
   positive; the first bid may equal the start bid. Each later bid is at least
   the current leading bid plus the step (see open decision D1 for whether a
   bid may exceed that).
5. Auction order is cyclic in turn order, starting with the landing player.
   On their move a participant bids or passes. A pass is irreversible. The
   leader does not respond to their own bid (is skipped). A participant who
   does not respond within 10 s has passed. Every active player, including
   the landing player, participates.
6. No participant may bid more than their balance. The leader's bid is
   reserved: reserved money cannot be spent elsewhere until the auction ends
   or the leader is outbid.
7. When all opponents of the leader have passed, the leader pays the bid to
   the bank and becomes the owner. If nobody bid, the asset stays free.
8. During the auction the turn timer is paused and conflicting actions are
   rejected (the turn owner cannot roll, end the turn or start another
   decision). After an auction started by the player's own choice, the turn
   continues with the remaining turn time; after one started by `EndTurn` or
   deadline, the turn closes after settlement. A double's bonus turn follows
   the existing rules.
9. Landing on an owned asset (any owner) has no effect in this stage.
10. Bids and passes are the first commands from players other than the turn
    owner; they are guarded by the auction target (id and revision), and a
    stale or duplicate command never changes state twice.
11. Projection: every viewer sees asset owners, the auction state (asset,
    leading bid and leader, whose response is due and its deadline, who has
    passed) and every balance.
12. Client, functional only: Vue buy/auction dialog for the landing player,
    auction panel with bid/pass and the 10 s response timer for every
    participant; PixiJS owner marker on owned cells; asset card shows the
    owner.
13. Server restart and tab reload during a pending decision or a running
    auction preserve it, and its deadlines are recomputed from state.
14. All new core rules have deterministic core tests, including replay.

## Scope and non-goals

In scope: `packages/game-core` ownership, purchase decision, auction,
reservation, pause/resume of the turn timer; `packages/protocol`;
`apps/server` deadlines and persistence; `apps/client` dialog, auction panel,
owner markers; tests and browser scenarios.

Not in scope: rent and building (stage 4); mortgage, debts, bankruptcy and
disposition of a resigned player's assets (stage 5); casino, chance, final
jail (stage 6); trades (stage 7); visual design (stage 8).

## Canonical sources

- `ROADMAP.md` stage 3, "Технические решения", and owner decisions of stages
  1-2.
- `GAME-BREAKDOWN.md` § "Покупка и аукцион", § "Начальная настройка и
  деньги" (quantization, no negative balances).
- `docs/efforts/stage-2-field-money.md` and its design (board, prices, money
  events).
- `openspec/config.yaml`, `openspec/specs/` as accepted after stage 2.

## Architecture constraints

Accepted (mandatory), unchanged: headless deterministic core with time and
entropy from TransitionContext; authoritative server, intents only, per-viewer
projection; one room per process, sequential commands; persist before
broadcast; recovery from snapshot plus log tail; stack as in ROADMAP.md.

## Delegated and reserved decisions

Team Lead decides: state and event shapes, target ids, command names, how the
timer pause is represented, protocol shapes, handling of stored stage 2 games,
task order, test strategy.

Open owner decision (CTO is collecting the answer; design so it is a single
rule, and do not merge the bid rule before it is recorded in ROADMAP):

- D1. Bid amount: exactly current + step (one "raise" action), or any amount
  of at least current + step. CTO recommendation: any amount of at least
  current + step.

Escalate to the CTO: a participant resigning during an auction (including the
leader); any other case where these rules do not determine the result.

## Dependencies, risks, and limits

- VM agents work only on branches with PRs; never push to `main`; rebase on
  current `main` before PR. A PR carrying a product decision is merged by the
  owner; routine PRs merge after independent review and green CI.
- Codex is the default Engineer engine; keep parallelism within usage limits.
- Deployment stays on the VPS bound to localhost.

## Required Team Lead output

Technical design (decision and auction state machine, reservation, timer
pause, deadlines and recovery, projection and protocol), task decomposition
with ordering, integration plan, evidence plan, focused escalations.

## Completion evidence

- CI green on the final `main`; `openspec validate --all --strict` passes.
- Independent review of every PR.
- Browser scenarios with 3 clients: buy at fixed price; decline into an
  auction won by another player; auction with no bids leaves the asset free;
  an AFK participant passes after 10 s; turn deadline without decision starts
  the auction and then closes the turn; a bid above the balance is rejected;
  tab reload and server restart during an auction.
- Replay test for the new core rules.
- ROADMAP.md "Сделано" updated.

## Revision history

- 1: initial handoff.

## Acceptance

The Team Lead records acceptance of this exact revision or returns exact gaps.
A material change creates a new revision.
