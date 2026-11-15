# Design

## Context

Base ca68750f19c54cccff99d72d5c75ba92eb744301 on
agent/task-s1-client-lobby, origin Daniil-33/board-game. Inspected client
API/routes, coordinator, connection, session, screens, view selectors,
TurnOrder, BoardScene, mock server/game and existing lobby tests. The server
proposal was read from the local origin/agent/task-s1-server-api ref; names
must be reconciled with the delivered implementation before Apply.

## Goals / Non-Goals

Render authoritative lifecycle changes and preserve guest reconnect. No
client rule simulation, server/protocol edits, economy or new dependencies.

## Decisions

### D1. Thin protocol API

Extend api/routes.ts with GET /api/rooms/:id and POST /api/rooms/:id/leave.
Use exported GetRoomResponseSchema, LeaveRoomResponseSchema and existing
create/join schemas. Create returns the full response so its creator-only
accessCode/inviteLink are not discarded. Create/join send optional accessCode
in their bodies; validate it with AccessCodeSchema, never a parallel regex.
Never log access codes, URLs containing them, or raw response/request bodies.
Keep creator secrets in coordinator memory, outside persisted RoomSummary;
reload cannot recover a code because get-room intentionally excludes it.

### D2. Room list and invite lifecycle

LobbyScreen labels every returned summary: open, locked, in play, finished
or full as appropriate. Use server joinable for one-click open joins. Locked
lobby rooms with fewer than six members offer code entry even though the
server defines joinable=false for locked rooms. All other unavailable rooms
have disabled join controls. The server remains the final capacity authority.

Use the server invite format /?room=<id>&code=<code>. Inject initial location
and history replacement through client dependencies. Parse room/code once,
retain a pending invite in memory through guest login and token rejection,
and remove consumed query secrets from the address bar. No code goes into
localStorage. A valid invite explicitly takes precedence over stored-room
reconnect, disconnecting the old local connection first. Join through the
ordinary authenticated route; failures remain visible with an explicit retry
and a way to dismiss the invite. Do not retry automatically on every render.
Creator UI shows the response code and a selectable absolute invite link
with Copy; clipboard failure leaves the selectable link and a useful message.

### D3. Coordinator cleanup and names

Centralize returning to lobby: disconnect, clear animations, clear local room
and creator secret state, and retain an explanatory notice until next entry.
Leave sends HTTP only in lobby; navigate on success. Socket ROOM_CLOSED and
get-room status closed use the same cleanup. Guard late async responses by
room identity and an entry generation so an old lookup cannot restore a room
after leave or overwrite a later visit to the same room.

Replace resolveNames' listRooms lookup and permanent lookedUp set with
get-room on entry/Welcome and PlayerAdded/PlayerLeftLobby updates. Serialize
or coalesce requests, retaining a refresh requested during an in-flight
lookup. Failure must permit later refresh; never cache a failed lookup as
resolved. Refresh all member nicknames from the checked response. Successful
background list polling clears its displayed prior poll error; pending
foreground operations must not have unrelated failures erased by an old poll.

### D4. Connection and resignation

ROOM_CLOSED stops and returns to lobby like a lost room. CONNECTION_REPLACED
stops retries, clears pending commands, and shows “This room is open in
another tab.” Keep guest and shared stored room so the active tab is not
disrupted. A plain socket drop continues existing Hello/backoff and unchanged
pending-command resend; it sends neither leave nor resignation.

Resign uses payload:null and expected:{kind:'revision',revision:<held frame
revision>}, without actor. Expose the checked frame revision to this command
path rather than trusting a duplicate revision inside the open view object.
It is available in setup/playing to any active connected participant,
regardless of turn owner or elapsed deadline. An inline confirmation states
that resignation is permanent and the viewer will keep watching; cancel sends
nothing. No local elimination before authoritative Update. Disable duplicate
pending sends and all gameplay actions for eliminated viewers. Rejection is
shown; a new confirmation may retry using the current revision.

### D5. Projection-driven game end and board

App routes finished to a dedicated GameOverScreen showing view.winner through
the refreshed nickname map and a return-to-lobby control. Return only clears
the local room/connection; it must not call lobby leave on a finished game.
No winner is inferred from counts. Resigned viewers remain in the game as
spectators, see “You are out”, and keep receiving projections. HUD entries
include eliminated participants even when absent from order/setup groups.
BoardScene receives eliminated and hides their tokens, retaining stable
player-index colors/slots for survivors. Elimination/finish updates cancel
obsolete queued movement and snap to the authoritative view so an animation
cannot recreate an eliminated token. Finish during setup needs no positions.

### D6. Development mock and evidence

Extend existing mock server/game, retaining its development-only scripted
role. Match protocol response schemas, flags, access-code validation/errors,
get/leave, creator close and connection replacement. Script resignation in
setup and play, including three-player spectator and two-player game-end
scenarios; no claim that the mock verifies production core rules. Timer/socket
drop must not eliminate anyone. Add deterministic tests with existing fake
fetch, socket, clock and injected board patterns. Screenshots cover lobby
open/locked/in-play, invite after login, leave/closure, resign/spectator and
winner. Store evidence paths in the agentctl report, not runtime files edited
by hand.

## Risks / Migration

- Unsynced original client specs: sync original then these deltas under Team
  Lead coordination; do not modify earlier change artifacts.
- Parallel protocol work: reconcile actual merged exports and invite format;
  ask Team Lead about material differences rather than add a private schema.
- Creator secrets are intentionally memory-only; leave/reload loses their UI
  copy. The invite itself still works when supplied to another browser.
- Browser clipboard permissions: selectable-link fallback is always present.
- No product rule changes or migrations. Revert client commits to roll back.

## Delivery Gate

This proposal is planning only. Report with --wake, obtain Team Lead approval,
then Apply in a fresh context. Verify focused scenarios and required commands,
rebase on current main before PR, record push/PR operations through agentctl,
and obtain green exact-head CI and independent review before acceptance.
