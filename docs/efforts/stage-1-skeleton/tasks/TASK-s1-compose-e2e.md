# Team Lead -> Engineer Task Handoff

```yaml
id: TASK-s1-compose-e2e
revision: 1
effort: EFF-stage-1-skeleton
project: economic-board-game
source_commit: main after TASK-s1-server-api and TASK-s1-client-lobby merge
owner: team-lead
status: proposed
```

## Outcome

Stage 1 is deployable and proven end to end: the whole system starts with one
Docker Compose command on the VPS (localhost only), real browsers play through
lobby, setup, turns, jail, resignation and game end, and the effort's
completion evidence is recorded. Stage 1 OpenSpec changes are archived and
`ROADMAP.md` "Сделано" is updated.

## Acceptance criteria

Product (effort handoff criteria 9, 10, 12 and "Completion evidence"):

1. `docker compose up` (one command, documented) builds and starts the server
   and Postgres, runs DB migrations, and serves the client bundle. Ports bind
   to `127.0.0.1` only.
2. Playwright scenarios against the Compose stack, each recorded (trace or
   video plus a short log):
   - two and three browser clients: guest login, lobby, start, setup order
     rolls, several turns;
   - tab reload mid-turn: the player reconnects and continues;
   - server container restart mid-game: rooms restore, clients reconnect,
     the game continues;
   - AFK player: auto-roll and turn closed by deadline;
   - third double sends to jail (seeded run, see criterion 4);
   - locked room via access code and via invite link; leave before start;
     creator leaving closes the room;
   - resignation down to a winner and the game-over screen.
3. Scenarios run in CI (Compose or service containers) or, if CI time is
   prohibitive, run locally with artifacts attached to the PR; the choice and
   reason are stated in the PR.

Technical proof:

4. A test-only deterministic entropy source enabled by an explicit environment
   variable that the production Compose file never sets; the server refuses to
   start with it unless `NODE_ENV` is `test` (or equivalent guard).
5. Archive (sync into `openspec/specs`) all stage 1 changes still open:
   `protocol-stage-1-frames`, `client-stage-1-skeleton`, `server-rooms`,
   `engine-resignation`, the server-api and client-lobby changes. Fix while
   archiving: protocol design D5 wording (protocol review RVW-004),
   engine-resignation proposal scope sentence (core-resign review RVW-001),
   and the repository-wide `openspec validate --all --strict` failures.
6. `ROADMAP.md` "Сделано" lists stage 1 as delivered (skeleton through all
   layers) without changing product text.
7. Final `main` CI green.

## Scope and non-goals

In scope: Dockerfiles, `docker-compose.yml`, Playwright setup and scenarios,
CI changes, the deterministic entropy switch in `apps/server`, OpenSpec
archive edits, `ROADMAP.md` "Сделано", a short deploy section in a README.

Not in scope: public exposure, TLS, production hardening, load tests
(stage 8), new product behavior, fixing product bugs found by scenarios
(report them; the Team Lead routes fixes).

## Canonical references

- `docs/efforts/stage-1-skeleton.md` revision 3 ("Completion evidence").
- `docs/efforts/stage-1-skeleton/design.md` § "Evidence plan".
- `apps/server/README.md`, server-api and client OpenSpec changes.

## Constraints and invariants

Localhost binding only. No secrets in Git; use env files ignored by Git with an
example file. Production paths use CSPRNG entropy.

## Dependencies

Starts after `TASK-s1-server-api` and `TASK-s1-client-lobby` merge. Docker runs
as `sg docker -c '<command>'` in sessions that predate the docker group change.

## Delegated decisions

Image layout, Compose service names, Playwright structure, how the client is
served (server static plugin or a separate container), CI strategy within the
criteria. Return to the Team Lead for anything that changes product behavior.

## Required workflow

Explore -> Propose (OpenSpec change, report with `--wake`) -> Team Lead
approval -> Apply in a fresh context -> Verify -> PR -> Review fixes.

## Required checks

`docker compose up` from a clean checkout, all Playwright scenarios, `pnpm
build`, `pnpm test`, `pnpm test:integration`, `openspec validate --all
--strict`, `git diff --check` over the range, green CI.

## Escalation conditions

A scenario fails because of a product bug or a missing behavior; CI cannot run
the scenarios; any need to expose the service publicly.

## Deliverables

Compose stack, scenarios and artifacts, archived specs, ROADMAP update, branch
`agent/task-s1-compose-e2e`, PR, CI evidence, independent review report,
residual risks.

The Engineer accepts the exact revision before editing. A material change
creates a new revision.
