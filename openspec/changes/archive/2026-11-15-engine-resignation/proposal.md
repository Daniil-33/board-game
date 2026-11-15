# Proposal

## Why

Stage 1 supports setup and turns but cannot remove a lobby participant or finish a game after resignation. TASK-s1-core-resign revision 1 implements effort revision 3 criteria 1b/1c and ROADMAP.md stage 1 owner decisions, consistent with GAME-BREAKDOWN.md § "Участники и поле", § "Порядок ходов, ход и кости", § "Завершение игры и симуляция", and § "Принятые технические границы и текущая реализация".

## What Changes

- `LeaveLobby`: system actor, lobby only, revision guard, payload `{ playerId: PlayerId }`; removes that participant. Missing member: `PLAYER_NOT_FOUND`; malformed payload: `INVALID_PAYLOAD`.
- `Resign`: player actor, setup/playing, revision guard, payload `null`. No turn ownership or deadline restriction. Retain the participant in `players`, append their id to public `eliminated`, remove their position, jail entry and setup/order membership. Repeat resignation: `PLAYER_ELIMINATED`.
- Public `winner: PlayerId | null`, initially null. One remaining active player after resignation ends the game in `finished`, with no turn, setup or pending deadline. All new player commands then reject; existing session duplicate-delivery semantics remain unchanged.
- Own-turn resignation cancels bonus and closes the turn with reason `resigned`, then starts the next surviving player unless the game finishes. Other-player resignation preserves the current turn and deadline.
- Setup resignation removes the player from groups, pending rolls and recorded rolls, preserving survivors' results. Replacing the current roller creates a fresh target and 45 s deadline; otherwise preserve the current target unless setup resolves and play begins.
- New public object-payload events: `PlayerLeftLobby { playerId }`, `PlayerResigned { playerId }`, `GameEnded { winner }`. Publish `TurnEnded.reason += 'resigned'`.
- **BREAKING** rules version becomes `core-3`; `core-2` states/logs require their original engine and are not silently migrated.

## Capabilities

### New Capabilities

- `engine/resignation`: permanent elimination, setup/turn cleanup and last-active-player victory.

### Modified Capabilities

- `engine/game-lifecycle`: lobby leave, finished phase and core-3 version gate.
- `engine/command-execution`: invariants for active versus eliminated participants and finished state.
- `engine/projection`: public elimination/winner fields and leave/resign/end events.

The implemented `engine-turn-cycle` change is still unsynced. This proposal builds on its phase and invariant deltas without editing that change; its turn/deadline behavior remains applicable except where resignation explicitly closes or removes a target.

## Impact

The implementation changes `packages/game-core/**` and this OpenSpec change, plus Team Lead-approved mechanical consumer updates to current rules-version constants and state/view/event fixtures in server, protocol and client tests and mocks. Extend lifecycle, setup and turn helpers; add one resignation module; update state, exports, rules registry, invariants and projection. Extend deterministic scenarios, replay/property tests and snapshot restoration. No dependencies added. Server/protocol consumers receive the names above for their own tasks.

## Out of Scope

Room creator authorization and room closure, access codes/listing, server/client/protocol behavior changes beyond those approved mechanical consumer updates, disconnect handling, economy and bankruptcy effects (stage 5), automatic removal of players who never reconnect (stage 8), and old-version migration.
