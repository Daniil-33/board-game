# Board game

Requires Docker with Compose v2. Copy `.env.example` to `.env` and replace the
password with random hexadecimal text (for example `openssl rand -hex 24`).
From the repository root, build and start the complete localhost stack:

```sh
docker compose up --build -d --wait
```

Open http://127.0.0.1:8080 in separate browser profiles. Only nginx publishes a
port, on localhost; the server and Postgres stay inside the Compose network.
The server applies migrations and restores rooms before listening. nginx serves
the Vite bundle and proxies HTTP and WebSocket traffic on the same origin.

`docker compose restart server` restarts the server without losing games.
`docker compose down` preserves the named database volume; `down -v` explicitly
deletes all data. Run the startup command again to rebuild after updates.
Use `docker compose logs server` to inspect startup and recovery.

Agent sessions with stale group membership use `sg docker -c '<command>'`.

## Browser evidence

Use Node 22 and pnpm 9.15.9. Install dependencies with `pnpm install
--frozen-lockfile` and Chromium with `pnpm exec playwright install --with-deps
chromium`. With the production stack running:

```sh
POSTGRES_PASSWORD=<same-password> E2E_RESTART_COMMAND='docker compose restart server' pnpm test:e2e
```

The restart command must target the same Compose project. On older agent
sessions wrap it in `sg docker -c 'docker compose -p s1-e2e restart server'`.
The serial suite uses independent browser contexts and actual 45 s / 20 s
rules deadlines. It exercises three players, movement, reload, server restart,
AFK, access code and invite, leaving, room closure and resignation to a winner.
The restart scenario always uses the default CSPRNG configuration.

Run the rare dice fixture on a **fresh separate database**, with no other
scenarios or prior commands in its server process:

```sh
WEB_PORT=8081 docker compose -p s1-seeded -f docker-compose.yml -f docker-compose.e2e.yml up --build -d --wait
E2E_DETERMINISTIC=1 E2E_BASE_URL=http://127.0.0.1:8081 pnpm test:e2e
WEB_PORT=8081 docker compose -p s1-seeded -f docker-compose.yml -f docker-compose.e2e.yml down -v
```

The override explicitly opts into `NODE_ENV=test` and `E2E_TEST_SEED=1036`.
Any explicit seed outside test mode, including an empty value, refuses startup.
No seed setting uses CSPRNG, even in test mode. Deterministic streams repeat
Timeout command IDs after a process restart: never use this override against
existing data or for recovery evidence. The seed was found by
`pnpm --filter @game/server exec tsx scripts/find-compose-fixture.ts` using the
complete core command flow: CreateGame, two AddPlayer commands, StartGame,
four order rolls (one tied round), then RollDice/EndTurn bonus turns. Its dice
are `[1,1]`, `[5,5]`, `[6,6]`; the third roll sends the player to jail before
movement. No dice or game-state manipulation endpoint exists.

Every context saves a trace and each scenario saves an event/revision/time log.
Trace screenshots are disabled because the UI can display room credentials;
DOM snapshots and actions remain available. Credentials are redacted before
trace attachment. After either success or failure, run
`python3 scripts/sanitize-artifacts.py test-results playwright-report` before
sharing artifacts; this also removes the temporary ignored credential list.
CI always sanitizes and uploads the traces, JSON report, scenario logs and
Compose logs. The dedicated Compose browser job runs both production and fresh
seeded suites; tests have no retries.
