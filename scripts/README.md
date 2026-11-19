# Visual-design evidence capture

The capture set is split into app screenshots and design frames. App screenshots are emitted by env-gated Playwright capture calls committed in the current task head. They use the current production web bundle for lobby/game flows and the isolated seeded fixture stack for debt and result states. Each page state is captured at both 1440×900 and 390×844 before the flow continues. The collector reads current-head screenshots from `screens/captured-app/` and `screens/captured-app-fixtures/` and pairs them with the closest frame from the two HTML exports. It labels nearest-frame states instead of claiming they are identical.

Produce app captures by running the Playwright 1.58.2 container with `E2E_SCREEN_EVIDENCE=1`. Use `E2E_SCREEN_EVIDENCE_DIR=/evidence/screens/captured-app` against the current production web stack (`/version.txt` must match the branch's product commit) for login, lobby, create-room, room, turn-order, board/game, mobile tabs, purchase, auction, observers and the reconnect banner. For the reconnect-banner pair, set `E2E_RECONNECT_STOP_COMMAND` to stop the task-local server; the flow waits for the visible offline banner, captures both viewports, then runs `E2E_RESTART_COMMAND` to restore the server. Use `E2E_SCREEN_EVIDENCE_DIR=/evidence/screens/captured-app-fixtures` with `E2E_FIXTURES=1` against the isolated fixture stack for asset card, shortfall, the `BUILD_QUOTA_USED` toast, liquidation, elimination and game-over. See `verification.md` for the exact commands and evidence logs.

Capture current design frames with the pinned browser container:

```sh
docker run --rm -v "$PWD":/workspace -v /srv/agents/evidence/TASK-vd-e2e/screens:/evidence -w /workspace mcr.microsoft.com/playwright:v1.58.2-noble node scripts/capture-design-frames.cjs /evidence/captured-design-frames
node scripts/collect-visual-screens.mjs /srv/agents/evidence /srv/agents/evidence/TASK-vd-e2e/screens
```

Capture staging-after Lighthouse and empty-cache transfer evidence with the approved task deployment version. Lighthouse 12.8.2 is installed as an exact root devDependency, and the script invokes that local CLI without `npx`. `TASK_EVIDENCE_DIR` and `STAGING_URL` configure output and origin. To also capture the board-colour render from staging at 1440×900, mount `/srv/agents/evidence/TASK-vd-board` and set `TASK_BOARD_EVIDENCE_DIR=/evidence-board`:

```sh
docker run --rm --network host --group-add 111 -v "$PWD":/workspace -v /srv/agents/evidence/TASK-vd-load-split:/evidence -v /srv/agents/evidence/TASK-vd-board:/evidence-board -v /usr/bin/docker:/usr/bin/docker -v /var/run/docker.sock:/var/run/docker.sock -e TASK_BOARD_EVIDENCE_DIR=/evidence-board -e TASK_ROOM_CLEANUP_COMMAND='docker exec -i game-staging-db-1 psql -U game -d game -v ON_ERROR_STOP=1 -At' -w /workspace mcr.microsoft.com/playwright:v1.58.2-noble node scripts/capture-staging-after.cjs
```

`capture-staging-after.cjs` requires `node_modules` mounted at `/workspace`, uses Playwright 1.58.2 and its bundled Chromium, and invokes the pinned local Lighthouse 12.8.2 CLI. Set `STAGING_URL`, `TASK_EVIDENCE_DIR`, `TASK_WORKSPACE_DIR`, and `TASK_BOARD_EVIDENCE_DIR` to configure the origin and paths. It writes version, raw Lighthouse JSON and CDP request logs to `/evidence`; the manual before/after table is maintained in `staging-after.md`. It finishes the created game, waits for the game-over screen, then removes only that `finished` room and its room-scoped rows in a database transaction through the configured `TASK_ROOM_CLEANUP_COMMAND`. The command needs the Docker CLI/socket and host docker group (GID 111) mounted into the browser container.
