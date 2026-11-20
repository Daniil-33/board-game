# Visual-design evidence capture

## Final visual-design evidence

This section reproduces `/srv/agents/evidence/TASK-vd-final-evidence/` from
the task branch. Build disposable task-local stacks from the committed task
head; do not reuse staging or another task's stack. The primary stack captures
the lobby, room, game, purchase, auction and reconnect states. The fixture
stack captures the asset card, rent shortfall, build-quota toast, liquidation,
the second turn after liquidation, elimination and game-over states.

```sh
TASK_SOURCE=$PWD
TASK_RUNNER=$(mktemp -d)/checkout
TASK_EVIDENCE=/srv/agents/evidence/TASK-vd-final-evidence
git clone --no-hardlinks --branch agent/task-vd-final-evidence "$TASK_SOURCE" "$TASK_RUNNER"
cd "$TASK_RUNNER"
TASK_HEAD=$(git rev-parse HEAD)
mkdir -p "$TASK_EVIDENCE/screens/captured-app" "$TASK_EVIDENCE/screens/captured-app-fixtures"

cat > /tmp/vd-final-evidence-network.yml <<'YAML'
networks:
  default:
    external: true
    name: ${TASK_NETWORK:?set TASK_NETWORK to the task-owned network}
YAML
sg docker -c 'docker network create --driver bridge --subnet 10.250.0.0/24 vd-final-evidence-net'
sg docker -c 'docker network create --driver bridge --subnet 10.251.0.0/24 vd-final-evidence-fixtures-net'
sg docker -c 'docker network create --driver bridge --subnet 10.252.0.0/24 vd-final-evidence-seeded-net'

# Clear only these task-owned projects so every capture starts with a fresh DB.
sg docker -c "TASK_NETWORK=vd-final-evidence-net POSTGRES_PASSWORD=local-final-evidence GIT_SHA=$TASK_HEAD WEB_PORT=8083 docker compose -f docker-compose.yml -f /tmp/vd-final-evidence-network.yml -p vd-final-evidence down --volumes"
sg docker -c "TASK_NETWORK=vd-final-evidence-fixtures-net POSTGRES_PASSWORD=local-final-evidence GIT_SHA=$TASK_HEAD WEB_PORT=8084 docker compose -f docker-compose.yml -f docker-compose.fixtures.yml -f /tmp/vd-final-evidence-network.yml -p vd-final-evidence-fixtures down --volumes"
sg docker -c "TASK_NETWORK=vd-final-evidence-seeded-net POSTGRES_PASSWORD=local-final-evidence GIT_SHA=$TASK_HEAD WEB_PORT=8085 docker compose -f docker-compose.yml -f docker-compose.e2e.yml -f /tmp/vd-final-evidence-network.yml -p vd-final-evidence-seeded down --volumes"

sg docker -c "TASK_NETWORK=vd-final-evidence-net POSTGRES_PASSWORD=local-final-evidence GIT_SHA=$TASK_HEAD WEB_PORT=8083 docker compose -f docker-compose.yml -f /tmp/vd-final-evidence-network.yml -p vd-final-evidence up --build -d --wait"
sg docker -c "TASK_NETWORK=vd-final-evidence-fixtures-net POSTGRES_PASSWORD=local-final-evidence GIT_SHA=$TASK_HEAD WEB_PORT=8084 docker compose -f docker-compose.yml -f docker-compose.fixtures.yml -f /tmp/vd-final-evidence-network.yml -p vd-final-evidence-fixtures up --build -d --wait"
sg docker -c "TASK_NETWORK=vd-final-evidence-seeded-net POSTGRES_PASSWORD=local-final-evidence GIT_SHA=$TASK_HEAD WEB_PORT=8085 docker compose -f docker-compose.yml -f docker-compose.e2e.yml -f /tmp/vd-final-evidence-network.yml -p vd-final-evidence-seeded up --build -d --wait"

E2E_RECONNECT_STOP_COMMAND="TASK_NETWORK=vd-final-evidence-net POSTGRES_PASSWORD=local-final-evidence docker compose -f docker-compose.yml -f /tmp/vd-final-evidence-network.yml -p vd-final-evidence stop server"
E2E_RESTART_COMMAND="TASK_NETWORK=vd-final-evidence-net POSTGRES_PASSWORD=local-final-evidence docker compose -f docker-compose.yml -f /tmp/vd-final-evidence-network.yml -p vd-final-evidence start server"
E2E_WEB_LOGS_COMMAND="TASK_NETWORK=vd-final-evidence-net POSTGRES_PASSWORD=local-final-evidence docker compose -f docker-compose.yml -f /tmp/vd-final-evidence-network.yml -p vd-final-evidence logs --no-color web"
E2E_FIXTURE_SQL_COMMAND="TASK_NETWORK=vd-final-evidence-fixtures-net POSTGRES_PASSWORD=local-final-evidence docker compose -f docker-compose.yml -f docker-compose.fixtures.yml -f /tmp/vd-final-evidence-network.yml -p vd-final-evidence-fixtures exec -T -e PGOPTIONS=-cdefault_transaction_read_only=on db psql -U game -d game -At"
E2E_FIXTURE_RESTART_COMMAND="TASK_NETWORK=vd-final-evidence-fixtures-net POSTGRES_PASSWORD=local-final-evidence docker compose -f docker-compose.yml -f docker-compose.fixtures.yml -f /tmp/vd-final-evidence-network.yml -p vd-final-evidence-fixtures restart server"
export TASK_SOURCE TASK_RUNNER TASK_EVIDENCE TASK_HEAD E2E_RECONNECT_STOP_COMMAND E2E_RESTART_COMMAND E2E_WEB_LOGS_COMMAND E2E_FIXTURE_SQL_COMMAND E2E_FIXTURE_RESTART_COMMAND

sg docker -c 'docker run --rm --network host --group-add 111 \
  -v "$PWD":/workspace -v "$TASK_SOURCE/node_modules":/workspace/node_modules -v "$TASK_SOURCE/apps/client/node_modules":/workspace/apps/client/node_modules -v "$TASK_EVIDENCE":/evidence \
  -v /usr/bin/docker:/usr/bin/docker -v /usr/libexec/docker/cli-plugins/docker-compose:/usr/libexec/docker/cli-plugins/docker-compose -v /var/run/docker.sock:/var/run/docker.sock -v /tmp/vd-final-evidence-network.yml:/tmp/vd-final-evidence-network.yml \
  -w /workspace -e GIT_CONFIG_COUNT=1 -e GIT_CONFIG_KEY_0=safe.directory \
  -e GIT_CONFIG_VALUE_0=/workspace -e E2E_SCREEN_EVIDENCE=1 \
  -e E2E_SCREEN_EVIDENCE_DIR=/evidence/screens/captured-app \
  -e E2E_BASE_URL=http://127.0.0.1:8083 \
  -e E2E_RECONNECT_STOP_COMMAND -e E2E_RESTART_COMMAND -e E2E_WEB_LOGS_COMMAND \
  mcr.microsoft.com/playwright:v1.58.2-noble \
  ./node_modules/.bin/playwright test e2e/game-layout.spec.ts e2e/compose.spec.ts --workers=1'

sg docker -c 'docker run --rm --network host --group-add 111 \
  -v "$PWD":/workspace -v "$TASK_SOURCE/node_modules":/workspace/node_modules -v "$TASK_SOURCE/apps/client/node_modules":/workspace/apps/client/node_modules -v "$TASK_EVIDENCE":/evidence \
  -v /usr/bin/docker:/usr/bin/docker -v /usr/libexec/docker/cli-plugins/docker-compose:/usr/libexec/docker/cli-plugins/docker-compose -v /var/run/docker.sock:/var/run/docker.sock -v /tmp/vd-final-evidence-network.yml:/tmp/vd-final-evidence-network.yml \
  -w /workspace -e GIT_CONFIG_COUNT=1 -e GIT_CONFIG_KEY_0=safe.directory \
  -e GIT_CONFIG_VALUE_0=/workspace -e E2E_SCREEN_EVIDENCE=1 -e E2E_DETERMINISTIC=1 \
  -e E2E_SCREEN_EVIDENCE_DIR=/evidence/screens/captured-app \
  -e E2E_BASE_URL=http://127.0.0.1:8085 \
  mcr.microsoft.com/playwright:v1.58.2-noble \
  ./node_modules/.bin/playwright test e2e/compose.spec.ts --grep "seed 129" --workers=1'

sg docker -c 'docker run --rm --network host --group-add 111 \
  -v "$PWD":/workspace -v "$TASK_SOURCE/node_modules":/workspace/node_modules -v "$TASK_SOURCE/apps/client/node_modules":/workspace/apps/client/node_modules -v "$TASK_EVIDENCE":/evidence \
  -v /usr/bin/docker:/usr/bin/docker -v /usr/libexec/docker/cli-plugins/docker-compose:/usr/libexec/docker/cli-plugins/docker-compose -v /var/run/docker.sock:/var/run/docker.sock -v /tmp/vd-final-evidence-network.yml:/tmp/vd-final-evidence-network.yml \
  -w /workspace -e GIT_CONFIG_COUNT=1 -e GIT_CONFIG_KEY_0=safe.directory \
  -e GIT_CONFIG_VALUE_0=/workspace -e E2E_SCREEN_EVIDENCE=1 \
  -e E2E_SCREEN_EVIDENCE_DIR=/evidence/screens/captured-app-fixtures \
  -e E2E_FIXTURES=1 -e E2E_BASE_URL=http://127.0.0.1:8084 -e E2E_FIXTURE_SQL_COMMAND -e E2E_FIXTURE_RESTART_COMMAND \
  mcr.microsoft.com/playwright:v1.58.2-noble \
  ./node_modules/.bin/playwright test e2e/stage4.spec.ts e2e/stage5.spec.ts --workers=1'

sg docker -c 'docker run --rm -v "$PWD":/workspace -v "$TASK_SOURCE/node_modules":/workspace/node_modules -v "$TASK_EVIDENCE":/evidence \
  -w /workspace mcr.microsoft.com/playwright:v1.58.2-noble \
  node scripts/capture-design-frames.cjs /evidence/design-frames'
node scripts/collect-visual-screens.mjs "$TASK_EVIDENCE" "$TASK_EVIDENCE/pairs"
```

The primary browser container needs the Docker socket only for the task-local
server stop/restart around the reconnect-banner capture. The fixture builders
are enabled only on the disposable fixture stack. Both capture suites use one
worker, and every sidecar must record `producerHead` equal to the served
`/version.txt`. The collector rejects missing or mismatched sidecars and any
blank app or design image.

## Existing evidence tooling

The older task-specific workflows below are retained for their original task.

### Required evidence order

1. Capture the 18 design frames into `TASK-vd-evidence-frames/design-frames/`.
2. Capture the app screens, including the stage 3 auction while the responding
   bidder's panel is visible.
3. Run `collect-visual-screens.mjs` to pair the app screenshots with the
   design frames.

Both capture and collection reject a PNG when its luminance standard deviation
is below **3** or it contains fewer than **16 distinct RGB colors**. These
limits reject white and solid-color frames while allowing rendered UI with a
large background. The collector checks every app and design image before it
copies any pair, and exits non-zero with the file name and measured values if
one fails. The same check runs immediately after each design-frame screenshot.

The capture set is split into app screenshots and design frames. App screenshots are emitted by env-gated Playwright capture calls committed in the current task head. They use the current production web bundle for lobby/game flows and the isolated seeded fixture stack for debt and result states. Each page state is captured at both 1440×900 and 390×844 before the flow continues. The collector reads current-head screenshots from `screens/captured-app/` and `screens/captured-app-fixtures/` and pairs them with the closest frame from the two HTML exports. It labels nearest-frame states instead of claiming they are identical.

Produce app captures by running the Playwright 1.58.2 container with `E2E_SCREEN_EVIDENCE=1`. Use `E2E_SCREEN_EVIDENCE_DIR=/evidence/screens/captured-app` against the current production web stack (`/version.txt` must match the branch's product commit) for login, lobby, create-room, room, turn-order, board/game, mobile tabs, purchase, auction, observers and the reconnect banner. For the reconnect-banner pair, set `E2E_RECONNECT_STOP_COMMAND` to stop the task-local server; the flow waits for the visible offline banner, captures both viewports, then runs `E2E_RESTART_COMMAND` to restore the server. Use `E2E_SCREEN_EVIDENCE_DIR=/evidence/screens/captured-app-fixtures` with `E2E_FIXTURES=1` against the isolated fixture stack for asset card, shortfall, the `BUILD_QUOTA_USED` toast, liquidation, elimination and game-over. Each `captureScreens` run writes `capture-manifest-<screen>.json` beside its images with the producer commit and viewports. The visual-screen collector requires current-head manifests for the toast and reconnect captures and rejects mismatches before collecting them.

Capture current design frames with the pinned browser container. Mount the task evidence directory at `/evidence`; the collector now uses these validated frames as its design sources:

```sh
docker run --rm -v "$PWD":/workspace -v /srv/agents/evidence/TASK-vd-evidence-frames:/evidence -w /workspace mcr.microsoft.com/playwright:v1.58.2-noble node scripts/capture-design-frames.cjs /evidence/design-frames
```

Capture app evidence after the design frames. For the auction pair, run the
stage 3 purchase/auction test with `E2E_SCREEN_EVIDENCE=1` and
`E2E_SCREEN_EVIDENCE_DIR=/evidence`; it captures `auction-desktop.png` and
`auction-mobile.png` from the bidder whose response is currently enabled. The
desktop file is a full-page screenshot so the auction panel, rendered below the
board, is included; the mobile file shows the responsive auction sheet.
This older collector invocation was superseded by the **Final visual-design evidence** recipe at the top of this file. Use that task-scoped recipe for current captures and collection.

The pure PNG statistics helper is covered by:

```sh
node --test scripts/image-stats.test.cjs
DESIGN_FRAME_DIR=/srv/agents/evidence/TASK-vd-evidence-frames/design-frames node --test scripts/image-stats.test.cjs
```

The second command also asserts that all 18 indexed frames pass.

Capture staging-after Lighthouse and empty-cache transfer evidence with the approved task deployment version. Lighthouse 12.8.2 is installed as an exact root devDependency, and the script invokes that local CLI without `npx`. `TASK_EVIDENCE_DIR` and `STAGING_URL` configure output and origin. To also capture the board-colour render from staging at 1440×900, mount `/srv/agents/evidence/TASK-vd-board` and set `TASK_BOARD_EVIDENCE_DIR=/evidence-board`:

```sh
docker run --rm --network host --group-add 111 -v "$PWD":/workspace -v /srv/agents/evidence/TASK-vd-load-split:/evidence -v /srv/agents/evidence/TASK-vd-board:/evidence-board -v /usr/bin/docker:/usr/bin/docker -v /var/run/docker.sock:/var/run/docker.sock -e TASK_BOARD_EVIDENCE_DIR=/evidence-board -e TASK_ROOM_CLEANUP_COMMAND='docker exec -i game-staging-db-1 psql -U game -d game -v ON_ERROR_STOP=1 -At' -w /workspace mcr.microsoft.com/playwright:v1.58.2-noble node scripts/capture-staging-after.cjs
```

`capture-staging-after.cjs` requires `node_modules` mounted at `/workspace`, uses Playwright 1.58.2 and its bundled Chromium, and invokes the pinned local Lighthouse 12.8.2 CLI. Set `STAGING_URL`, `TASK_EVIDENCE_DIR`, `TASK_WORKSPACE_DIR`, and `TASK_BOARD_EVIDENCE_DIR` to configure the origin and paths. It writes version, raw Lighthouse JSON and CDP request logs to `/evidence`; the manual before/after table is maintained in `staging-after.md`. It finishes the created game, waits for the game-over screen, then removes only that `finished` room and its room-scoped rows in a database transaction through the configured `TASK_ROOM_CLEANUP_COMMAND`. The command needs the Docker CLI/socket and host docker group (GID 111) mounted into the browser container.
