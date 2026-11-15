# CTO -> Team Lead Effort Handoff

```yaml
id: EFF-stage-1-skeleton
revision: 3
project: economic-board-game
repo: github.com/Daniil-33/board-game
created_at: 2026-11-14T15:00:00Z
source_commit: 5338f6f2416110bc9c2195ef557482f9f9696564 # plus the docs PR that adds this file
owner: cto
status: proposed
```

## Outcome

ROADMAP.md stage 1 "Сквозной скелет": the first end-to-end slice through every
layer (core, protocol, server, client, infrastructure) on a minimal game
without economy. Every later stage adds one mechanic across all layers on top
of this skeleton, so its boundaries must be the ones the MVP keeps.

## Expected behavior and acceptance criteria

Agreed with the owner. Source: ROADMAP.md stage 1, owner decisions of
2026-11-14 recorded there.

1. Two to six people in separate browsers enter as guests (nickname plus a
   server session token), create or join a room in the lobby, and the room
   creator starts the game once at least two participants are present.
1a. Every room is listed in the public lobby list. The creator may set an
   access code; such a room is joinable only with the code or an invite link
   carrying it. A room without a code is joinable from the list while seats
   remain.
1b. A participant may leave a room before the game starts. If the creator
   leaves, the room closes.
1c. Leaving during the game is resignation: the player is permanently
   eliminated, removed from the turn order, and an unfinished own turn is
   closed. When one active player remains, that player wins and the game ends.
   A dropped connection is not resignation (reconnect plus timeouts apply).
2. Setup: each participant rolls one die; order is descending; only tied
   participants reroll, starting from the first unresolved group. Each setup
   roll has a 45 s deadline; on expiry the system rolls for the participant.
3. Turns: 45 s per turn, 2d6 roll. Player commands are accepted strictly before
   the deadline; Timeout is valid at the deadline and later and is bound to
   turnId and revision. If no roll happened, the system rolls and grants 20 s
   continuation of the same turn without resetting quotas. If the player is
   idle after the roll, at the deadline the system performs mandatory
   settlement and closes the turn.
4. Doubles: a double grants a bonus turn with fresh time and quotas. A double
   from an automatic roll grants the bonus turn after the current turn and its
   mandatory settlement. A third consecutive double sends the player to jail
   before movement, resets the streak and ends the turn.
5. Interim jail rule (no money, marked temporary in code and protocol, replaced
   in stage 6): on each of up to three own turns the prisoner tries to roll a
   double; a double releases and the player moves by that sum, and this double
   grants no bonus turn (owner decision 2026-11-14); after the third
   failed roll the player leaves and moves by that roll's sum.
6. Movement by the 2d6 sum around a ring of 40 cells. The layout is a
   placeholder for stage 2 and must be clearly marked as such.
7. Turn quotas (one build, two trade offers) exist only as counters.
8. Protocol messages Hello, Welcome, Command, Ack, Update with error codes and a
   protocol version, in `packages/protocol`, shared by client and server. On
   every change the server sends the full viewer projection plus events for
   animation. Reconnect is a repeated Hello with the last known revision.
9. Reloading a tab or dropping the network does not break the game: the player
   reconnects and continues.
10. Restarting the server loses no game: rooms are restored from the Postgres
    snapshot plus log tail and timers are recomputed from state deadlines.
11. Client: Vue screens for login and lobby, HUD with turn order and timer;
    PixiJS ring board, tokens, dice and movement animation.
12. The whole system (server and Postgres) starts with one Docker Compose
    command, with DB migrations and build/run scripts.
13. All new core rules are covered by deterministic core tests, including
    replay.

## Scope and non-goals

In scope: `packages/game-core` turn/setup/doubles/interim jail/movement rules,
new `packages/protocol`, `apps/server`, `apps/client`, Compose, migrations,
CI.

Not in scope: real CLASSIC_40 layout, money, rewards, any economy (stage 2+);
final jail rules (stage 6); accounts/OAuth, Redis, horizontal scaling, bots;
public internet exposure of the VPS deployment.

## Canonical sources

- `ROADMAP.md` stage 1 and "Технические решения" (this repo).
- `GAME-BREAKDOWN.md` § "Порядок ходов, ход и кости", § "Принятые технические
  границы и текущая реализация".
- `openspec/config.yaml` architecture constraints.
- `openspec/specs/engine/*` accepted engine specs.
- Owner decisions: ROADMAP.md stage 1 "Решения владельца (приняты 2026-11-14)";
  voice evidence `/srv/agent-runtime/state/inbox/VOICE-20261114T135952849455Z-bcfd53/transcript.txt`.

## Architecture constraints

Accepted (mandatory):

- Headless deterministic core: no UI, server, DB, network, timers or global
  random in `game-core`; time and entropy come through TransitionContext.
- Server is authoritative; clients send intents only and see only their own
  projection. One room is processed by one process, commands sequentially; the
  server supplies actor from the session, time, and CSPRNG entropy.
- Write order: core executes, the accepted command is persisted to the DB log,
  only then updates are broadcast. Unique index `(game_id, revision)`.
- Stack from ROADMAP.md: Fastify + @fastify/websocket, PostgreSQL with jsonb log
  and snapshots, Drizzle or Kysely (no heavy ORM), Vite + Vue 3 + PixiJS,
  pnpm workspaces, vitest, Docker Compose single node.

## Delegated and reserved decisions

Team Lead decides: TypeBox vs zod, Drizzle vs Kysely, module layout, internal
interfaces, test strategy, task order, snapshot frequency.

Reserved to the owner (escalate via CTO):

- Any product rule not listed above.

## Dependencies, risks, and limits

- Docker: user `agents` is in group `docker` since 2026-11-14. Sessions
  started before that must run Docker as `sg docker -c '<command>'` until
  they are restarted.
- The owner develops locally in parallel. VM agents work only on branches with
  PRs; never push to `main` directly. Rebase on current `main` before PR.
- First task: CI (GitHub Actions: pnpm install, typecheck, tests) so later PRs
  can merge automatically after independent review and green CI. A PR that
  contains a product decision is merged by the owner.
- Deployment stays on the VPS, bound to localhost; no public exposure.

## Required Team Lead output

Technical design for the protocol, room process, persistence and recovery;
task decomposition with ordering; integration plan; evidence plan; focused
escalations.

## Completion evidence

- CI green on the final `main`.
- Independent review of every PR.
- Scenario evidence: two and three browser clients play setup and several
  turns; tab reload mid-turn; server restart mid-game with recovery; AFK
  player auto-rolled and turn closed by deadline; third double sends to jail.
- Replay test for the new core rules.
- ROADMAP.md "Сделано" updated.

## Revision history

- 1: initial handoff.
- 2: owner resolved the interim jail bonus question (no bonus turn); no other
  change.
- 3: owner lobby decisions 2026-11-14: public room list with optional access
  code / invite link, leave before start (creator leaving closes the room),
  leaving during the game = resignation (criteria 1a-1c).

## Acceptance

The Team Lead records acceptance of this exact revision or returns exact gaps.
A material change creates a new revision.
