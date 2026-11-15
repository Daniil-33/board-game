# Team Lead -> Engineer Task Handoff

```yaml
id: TASK-s1-client-lobby
revision: 1
effort: EFF-stage-1-skeleton
project: economic-board-game
source_commit: ca68750 # main with core resign/game end (PR #18)
owner: team-lead
status: proposed
```

## Outcome

`apps/client` supports the effort handoff revision 3 lobby and game-end
behavior: access codes and invite links, leaving a room before start, resigning
during a game, the game-over screen, and correct nicknames for late joiners.

## Acceptance criteria

Product (effort handoff rev 3 criteria 1a-1c):

1. Lobby list shows every listed room with its state: open, locked (access
   code) or in play (not joinable). Open rooms join with one click; locked
   rooms ask for the code. In-play rooms cannot be joined.
2. Create room with an optional access code. The creator sees the code and a
   copyable invite link. Opening an invite link (after guest login if needed)
   joins that room with the code from the link.
3. Leave button in the room before start. When the creator leaves, or the room
   closes for any member, every member returns to the lobby with a clear
   message.
4. Resign button during setup and play, with a confirmation step. After
   resigning, the player stays connected as a spectator of the projection and
   sees that they are out.
5. Game over: when the game ends, every client shows the winner and a way back
   to the lobby. Eliminated players are visibly marked in the HUD and on the
   board (token removed or greyed).
6. A dropped connection is never shown as resignation; reconnect works as
   before.

Technical proof:

7. Nicknames for all members come from the get-room route (client review
   RVW-005), refreshed on `PlayerAdded`/`PlayerLeftLobby` updates.
8. Lobby poll errors clear on the next successful poll (client review RVW-006).
9. Uses only `@game/protocol` schemas and the server-api routes; the mock
   server is extended to cover access codes, leave, room close, resign and
   game end.
10. Component/unit tests for each criterion above; `pnpm build`,
    `pnpm test`, `vite build` pass.

## Scope and non-goals

In scope: `apps/client/**`.

Not in scope: protocol or server changes (TASK-s1-server-api owns them),
Playwright end-to-end scenarios (TASK-s1-compose-e2e), styling beyond a clean
usable layout, a player who never reconnects (stage 8).

## Canonical references

- `docs/efforts/stage-1-skeleton.md` revision 3, criteria 1a-1c.
- `docs/efforts/stage-1-skeleton/tasks/TASK-s1-server-api.md` revision 2
  (routes, fields) and its OpenSpec change once proposed.
- `openspec/changes/engine-resignation` (LeaveLobby, Resign, eliminated,
  winner, finished, PlayerLeftLobby, PlayerResigned, GameEnded).
- `openspec/changes/client-stage-1-skeleton` (existing client design).

## Constraints and invariants

Server is authoritative; the client sends intents only. Access codes appear
only in the creator's UI and in invite links; never log them. Payload-less
events carry `payload: null`.

## Dependencies

The protocol additions (access code, get-room, leave, statuses, `Resign`
command) are delivered by `TASK-s1-server-api`. Explore and Propose may start
now against that task's handoff; Apply waits until its protocol changes are on
`main`, unless the Team Lead relays exact names earlier. Do not edit
`packages/protocol`.

## Delegated decisions

Component structure, invite-link URL shape on the client side (must match the
server's invite format), confirmation UI, spectator presentation. Return to
the Team Lead for any behavior not covered above.

## Required workflow

Explore -> Propose (OpenSpec change, report with `--wake`) -> Team Lead
approval -> Apply in a fresh context -> Verify -> PR -> Review fixes.

## Required checks

`pnpm install --frozen-lockfile`, `pnpm build`, `pnpm test`, `vite build`,
`git diff --check` over the range, green CI on the PR head, screenshots of
lobby (open/locked/in play), invite join, leave, resign and game over against
the mock.

## Escalation conditions

A UI behavior that implies a product rule not in revision 3; protocol fields
missing for a criterion.

## Deliverables

Client changes, tests, mock extensions, OpenSpec change, branch
`agent/task-s1-client-lobby`, PR, CI evidence, screenshots, independent review
report, residual risks.

The Engineer accepts the exact revision before editing. A material change
creates a new revision.
