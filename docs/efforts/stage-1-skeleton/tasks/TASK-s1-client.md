# Team Lead -> Engineer Task Handoff

```yaml
id: TASK-s1-client
revision: 1
effort: EFF-stage-1-skeleton
project: economic-board-game
source_commit: 34436b2 # main after packages/protocol (PR #6)
owner: team-lead
status: proposed
```

## Outcome

`apps/client`: a Vite + Vue 3 + PixiJS browser client for stage 1 that logs in
as a guest, uses the lobby, connects to a room over WebSocket with the shared
protocol, and shows setup and turns: the ring board, tokens, dice and movement
animation, turn order and the turn timer. It runs against a local mock server
in this task; the real server replaces the mock in `TASK-s1-compose-e2e`.

## Acceptance criteria

Product (handoff criteria 1, 8, 9, 11):

1. Login screen: nickname -> guest login; the token is kept in
   `localStorage` so a reload keeps the same guest.
2. Lobby screen: list joinable rooms, create a room, join a room; the room
   view shows members; the creator sees a Start button enabled only with at
   least two members. No leave-room control (open owner question).
3. Game screen, Vue HUD: turn order, active player, the turn or setup-roll
   timer computed from the server deadline in the view (not a local 45 s
   countdown), buttons RollForOrder / RollDice / EndTurn enabled only when the
   view allows them for this player, rejected-command messages from `Ack`.
4. PixiJS canvas: ring of 40 cells (the placeholder layout from game-core,
   visibly marked as placeholder), jail cell, one token per player, dice
   animation and step-by-step token movement driven by `Update.events`.
5. Reconnect: on socket close or tab reload, the client reconnects with
   `Hello { lastRevision }` and renders the `Welcome` view; no duplicate
   commands on reconnect (each command keeps its `commandId`).

Technical proof:

6. All frames go through `@game/protocol` decoders; the client never sends
   `actor`; outcomes are never computed locally.
7. A mock server (dev-only script or vitest fixture, not shipped) that speaks
   the protocol and replays a scripted game, enough to demo every screen.
8. Component/unit tests (vitest + @vue/test-utils or equivalent) for: timer
   from deadline, button enablement per view, reconnect flow, event-to-
   animation queue ordering. PixiJS rendering is smoke-tested only.
9. `pnpm build` (typecheck) and `pnpm test` pass; `vite build` produces a
   static bundle.

## Scope and non-goals

In scope: `apps/client/**`, dev dependencies for Vite/Vue/PixiJS/test-utils,
lockfile.

Not in scope: server code, Docker, e2e Playwright scenarios (compose-e2e
task), money/assets UI, styling beyond a clean usable layout, leave-room,
accounts.

## Canonical references

- `docs/efforts/stage-1-skeleton.md` rev 2; `docs/efforts/stage-1-skeleton/design.md` § "Client".
- `packages/protocol` (merged, `openspec/changes/protocol-stage-1-frames`).
- `openspec/changes/engine-turn-cycle` on branch `agent/task-s1-core-turns`
  for view fields and event names (`TurnStarted`, `DiceRolled`, `PlayerMoved`,
  `SentToJail`, ...). That branch is not merged yet; import types from
  game-core only after it merges, use local type stubs until then.
- `ROADMAP.md` stage 1 "Клиент".

## Constraints and invariants

Server is authoritative; the client sends intents only. The client may import
game-core types and pure constants (ring layout), never transition logic.
Payload-less events carry `payload: null`.

## Dependencies

Protocol merged. Core-turns is in progress: rebase on it once merged and
replace stubs with real types before the PR. Server API is a later task; do
not invent server routes beyond the protocol's lobby schemas.

## Delegated decisions

Component structure, state management (plain Vue reactivity or Pinia),
animation timing, mock-server shape, test tooling. Return to the Team Lead for
any new protocol field or any UI behavior that implies a product rule.

## Required workflow

Explore -> Propose (OpenSpec change, report with `--wake`) -> Team Lead
approval -> Apply in a fresh context -> Verify -> PR -> Review fixes.

## Required checks

`pnpm install --frozen-lockfile`, `pnpm build`, `pnpm test`, `vite build`,
green CI on the PR head, `git diff --check`, a short screen recording or
screenshots of login, lobby and a few turns against the mock.

## Escalation conditions

A screen needs a product rule not in the handoff; the view lacks data the HUD
needs (raise to the Team Lead, who coordinates with core-turns); PixiJS or Vue
version conflicts with the Node 22 toolchain.

## Deliverables

Client app, tests, mock server, OpenSpec change, branch
`agent/task-s1-client`, PR, CI evidence, screenshots, independent review
report, residual risks.

The Engineer accepts the exact revision before editing. A material change
creates a new revision.
