// Reproduction: docker run --rm --network host --group-add 111
// -v "$PWD":/workspace -v "$TASK_EVIDENCE_DIR":/evidence
// -v /usr/bin/docker:/usr/bin/docker -v /var/run/docker.sock:/var/run/docker.sock
// -e TASK_ROOM_CLEANUP_COMMAND='docker exec -i game-staging-db-1 psql -U game -d game -v ON_ERROR_STOP=1 -At'
// mcr.microsoft.com/playwright:v1.58.2-noble node scripts/capture-staging-after.cjs
// Lighthouse is pinned in the root package.json. Configure STAGING_URL and
// TASK_EVIDENCE_DIR when the defaults do not fit the host environment.
const { chromium } = require('/workspace/node_modules/.pnpm/node_modules/playwright');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cleanupCommand = process.env.TASK_ROOM_CLEANUP_COMMAND;

const base = process.env.STAGING_URL || 'https://stage.focusima.space';
const evidence = process.env.TASK_EVIDENCE_DIR || '/evidence';
const workspace = process.env.TASK_WORKSPACE_DIR || '/workspace';
const boardEvidence = process.env.TASK_BOARD_EVIDENCE_DIR;
fs.mkdirSync(evidence, { recursive: true });
const selector = id => `[data-testid="${id}"]`;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-e2e-game-'));

async function attachView(page) {
  await page.addInitScript(() => {
    const Native = window.WebSocket;
    window.WebSocket = class extends Native {
      constructor(url, protocols) {
        super(url, protocols);
        this.addEventListener('message', event => {
          try {
            const frame = JSON.parse(String(event.data));
            if (frame.t === 'Welcome' || frame.t === 'Update') window.__e2eView = frame.view;
          } catch {}
        });
      }
    };
  });
}

async function login(page, nickname) {
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.locator(selector('nickname')).fill(nickname);
  await page.locator(selector('login-enter')).click();
  await page.locator(selector('screen-login')).waitFor({ state: 'detached' });
}

async function transferCapture(page, name, stagingVersion) {
  const session = await page.context().newCDPSession(page);
  await session.send('Network.enable');
  const pending = new Map(), requests = [];
  session.on('Network.requestWillBeSent', event => pending.set(event.requestId, {
    url: event.request.url, method: event.request.method,
  }));
  session.on('Network.responseReceived', event => {
    const item = pending.get(event.requestId);
    if (item) Object.assign(item, {
      status: event.response.status,
      protocol: event.response.protocol,
      contentEncoding: Object.entries(event.response.headers).find(([key]) => key.toLowerCase() === 'content-encoding')?.[1] ?? null,
    });
  });
  session.on('Network.loadingFinished', event => {
    const item = pending.get(event.requestId);
    if (item) requests.push({ ...item, encodedDataLength: event.encodedDataLength });
    pending.delete(event.requestId);
  });
  await session.send('Network.clearBrowserCache');
  await session.send('Network.setCacheDisabled', { cacheDisabled: true });
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator(selector('board-canvas')).waitFor({ state: 'visible' });
  fs.writeFileSync(path.join(evidence, name), JSON.stringify({
    stagingVersion, requestedUrl: base, cache: 'disabled and cleared before navigation',
    bytes: requests.reduce((sum, request) => sum + request.encodedDataLength, 0), requests,
  }, null, 2));
  await session.detach();
}

function lighthouse(url, output, userDataDir) {
  const flags = `--headless --no-sandbox --disable-dev-shm-usage --disable-cache --user-data-dir=${userDataDir}`;
  const lighthouseCli = path.join(workspace, 'node_modules/lighthouse/cli/index.js');
  const result = spawnSync(process.execPath, [
    lighthouseCli, url, '--output=json', `--output-path=${path.join(evidence, output)}`,
    '--only-categories=performance', '--form-factor=mobile', '--throttling-method=simulate',
    '--disable-storage-reset', `--chrome-flags=${flags}`,
  ], { env: { ...process.env, CHROME_PATH: '/ms-playwright/chromium-1208/chrome-linux64/chrome' }, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`Lighthouse ${output} failed with status ${result.status}`);
}

function cleanupRoom(roomId) {
  if (!/^r_[A-Za-z0-9_-]+$/.test(roomId)) throw new Error(`Invalid task-created room id: ${roomId}`);
  if (!cleanupCommand) throw new Error('TASK_ROOM_CLEANUP_COMMAND is required to remove the task-created staging room');
  const sql = [
    'BEGIN;',
    `DELETE FROM game_results WHERE room_id = '${roomId}';`,
    `DELETE FROM chat_messages WHERE room_id = '${roomId}';`,
    `DELETE FROM game_log WHERE game_id = '${roomId}';`,
    `DELETE FROM game_snapshots WHERE game_id = '${roomId}';`,
    `DELETE FROM room_members WHERE room_id = '${roomId}';`,
    `DELETE FROM rooms WHERE id = '${roomId}' AND status = 'finished' RETURNING id;`,
    'COMMIT;',
  ].join('\n');
  const result = spawnSync('sh', ['-c', cleanupCommand], { input: sql, encoding: 'utf8', maxBuffer: 1024 * 1024 });
  if (result.status !== 0 || !result.stdout.includes(roomId)) {
    throw new Error(`Staging cleanup failed for finished room ${roomId}: ${result.stderr || result.stdout}`);
  }
  return { roomId, removed: true, method: 'transactional deletion of this finished task room and its room-scoped records' };
}

async function main() {
  const versionResponse = await fetch(`${base}/version.txt`, { redirect: 'error' });
  if (!versionResponse.ok) throw new Error(`version.txt returned ${versionResponse.status}`);
  const stagingVersion = (await versionResponse.text()).trim();
  fs.writeFileSync(path.join(evidence, 'version.txt'), `${stagingVersion}\n`);

  // Empty context gives the login transfer measurement with an empty cache.
  const browser = await chromium.launch({ channel: 'chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const loginContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const loginPage = await loginContext.newPage();
  await loginPage.goto(base, { waitUntil: 'networkidle' });
  await loginPage.locator(selector('screen-login')).waitFor({ state: 'visible' });
  const loginSession = await loginPage.context().newCDPSession(loginPage);
  await loginSession.send('Network.enable');
  const loginPending = new Map(), loginRequests = [];
  loginSession.on('Network.requestWillBeSent', event => loginPending.set(event.requestId, { url: event.request.url, method: event.request.method }));
  loginSession.on('Network.responseReceived', event => {
    const item = loginPending.get(event.requestId);
    if (item) Object.assign(item, { status: event.response.status, protocol: event.response.protocol,
      contentEncoding: Object.entries(event.response.headers).find(([key]) => key.toLowerCase() === 'content-encoding')?.[1] ?? null });
  });
  loginSession.on('Network.loadingFinished', event => {
    const item = loginPending.get(event.requestId);
    if (item) loginRequests.push({ ...item, encodedDataLength: event.encodedDataLength });
    loginPending.delete(event.requestId);
  });
  await loginSession.send('Network.clearBrowserCache');
  await loginSession.send('Network.setCacheDisabled', { cacheDisabled: true });
  await loginPage.reload({ waitUntil: 'networkidle' });
  await loginPage.locator(selector('screen-login')).waitFor({ state: 'visible' });
  fs.writeFileSync(path.join(evidence, 'staging-after-login-transferred.json'), JSON.stringify({
    stagingVersion, requestedUrl: base, cache: 'disabled and cleared before navigation',
    bytes: loginRequests.reduce((sum, request) => sum + request.encodedDataLength, 0), requests: loginRequests,
  }, null, 2));
  await loginSession.detach();
  await loginContext.close();

  // Persistent host context retains the authenticated game for Lighthouse.
  const hostContext = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true, viewport: { width: 390, height: 844 },
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const hostPage = hostContext.pages()[0] || await hostContext.newPage();
  await attachView(hostPage);
  const guestBrowser = await chromium.launch({ channel: 'chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const guestContext = await guestBrowser.newContext({ viewport: { width: 390, height: 844 } });
  const guestPage = await guestContext.newPage();
  await attachView(guestPage);
  const tag = `VDE2E${Date.now().toString(36)}`;
  await login(hostPage, `${tag}H`);
  await hostPage.locator(selector('open-create')).click();
  await hostPage.locator(selector('create')).click();
  await hostPage.locator(selector('screen-room')).waitFor({ state: 'visible' });
  const roomId = (await hostPage.locator(selector('room-title')).innerText()).replace('Комната ', '').trim();
  await login(guestPage, `${tag}G`);
  await guestPage.locator(selector('refresh')).click();
  const room = guestPage.locator(`${selector('room')}[data-room-id="${roomId}"]`);
  await room.waitFor({ state: 'visible' });
  await room.locator(selector('join')).click();
  await guestPage.locator(selector('screen-room')).waitFor({ state: 'visible' });
  await hostPage.locator(selector('start')).click();
  await hostPage.locator(selector('board-canvas')).waitFor({ state: 'visible' });
  await guestPage.locator(selector('board-canvas')).waitFor({ state: 'visible' });

  for (let roll = 0; roll < 32; roll++) {
    const current = await hostPage.evaluate(() => window.__e2eView);
    if (current?.phase !== 'setup') break;
    const playerId = current.setup.playerId;
    // Resolve the current setup owner from the account id exposed after login.
    const hostId = await hostPage.evaluate(() => localStorage.getItem('game.guest') && JSON.parse(localStorage.getItem('game.guest')).guestId);
    const target = playerId === hostId ? hostPage : guestPage;
    const before = await target.evaluate(() => window.__e2eView?.revision);
    const button = target.locator(selector('RollForOrder'));
    await button.waitFor({ state: 'visible' });
    await button.click();
    await target.waitForFunction(revision => window.__e2eView && window.__e2eView.revision > revision, before);
  }
  await hostPage.waitForFunction(() => window.__e2eView?.phase === 'playing');
  await hostPage.locator(selector('board-canvas')).waitFor({ state: 'visible' });

  if (boardEvidence) {
    await hostPage.setViewportSize({ width: 1440, height: 900 });
    await hostPage.locator(selector('board-canvas')).waitFor({ state: 'visible' });
    fs.mkdirSync(boardEvidence, { recursive: true });
    await hostPage.screenshot({ path: path.join(boardEvidence, 'staging-render.png'), fullPage: false });
    fs.writeFileSync(path.join(boardEvidence, 'staging-render.json'), JSON.stringify({
      requestedUrl: base, stagingVersion, viewport: '1440x900', renderedFromStaging: true,
    }, null, 2));
  }

  await transferCapture(hostPage, 'staging-after-game-transferred.json', stagingVersion);
  await hostContext.close();
  lighthouse(`${base}/`, 'staging-after-login-lighthouse.json', fs.mkdtempSync(path.join(os.tmpdir(), 'vd-e2e-login-')));
  lighthouse(`${base}/`, 'staging-after-game-lighthouse.json', profile);
  for (let turn = 0; turn < 8; turn++) {
    const view = await guestPage.evaluate(() => window.__e2eView);
    if (!view?.purchase && !view?.auction) break;
    const guestId = await guestPage.evaluate(() => JSON.parse(localStorage.getItem('game.guest')).guestId);
    const hostId = await hostPage.evaluate(() => JSON.parse(localStorage.getItem('game.guest')).guestId);
    const actorId = view.purchase?.playerId ?? view.auction.responder;
    const actor = actorId === hostId ? hostPage : actorId === guestId ? guestPage : null;
    if (!actor) throw new Error(`Cannot resolve decision actor ${actorId}`);
    const before = await actor.evaluate(() => window.__e2eView?.revision);
    const decision = view.purchase ? actor.locator(selector('buy')) : actor.locator(selector('pass'));
    await decision.waitFor({ state: 'visible' });
    await decision.click();
    await actor.waitForFunction(revision => window.__e2eView && window.__e2eView.revision > revision, before);
  }
  const assetClose = guestPage.locator(selector('asset-close'));
  if (await assetClose.isVisible()) await assetClose.click();
  await guestPage.locator(selector('game-tab-more')).click();
  await guestPage.locator(selector('Resign')).click();
  await guestPage.locator(selector('confirm-resign')).click();
  await guestPage.locator(selector('game-over-title')).waitFor({ state: 'visible' });
  const roomCleanup = cleanupRoom(roomId);
  await guestContext.close();
  await guestBrowser.close();
  await browser.close();
  fs.writeFileSync(path.join(evidence, 'staging-after-capture.json'), JSON.stringify({
    stagingVersion, lighthouseVersion: '12.8.2', playwrightVersion: '1.58.2', viewport: '390x844', throttling: 'mobile simulated navigation', roomCleanup,
  }, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
