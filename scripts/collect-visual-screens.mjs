#!/usr/bin/env node
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { assertNonBlankImage } = require('./image-stats.cjs');

const evidenceRoot = process.argv[2] ?? '/srv/agents/evidence/TASK-vd-final-evidence';
const out = process.argv[3] ?? resolve(evidenceRoot, 'pairs');
const captureRoot = resolve(evidenceRoot, 'screens');
const checkoutHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const fixtureScreens = new Set(['asset-card', 'rent-shortfall', 'build-quota-toast', 'liquidation', 'elimination', 'game-over']);
const provenance = new Map();
function readManifest(screen) {
  const captureSet = fixtureScreens.has(screen) ? 'captured-app-fixtures' : 'captured-app';
  const manifestPath = resolve(captureRoot, captureSet, `capture-manifest-${screen}.json`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.screen !== screen || !Array.isArray(manifest.viewports)
    || !manifest.viewports.includes('desktop') || !manifest.viewports.includes('mobile')) {
    throw new Error(`Invalid capture provenance for ${screen}`);
  }
  if (manifest.producerHead !== checkoutHead) {
    throw new Error(`Capture ${screen} was produced by ${manifest.producerHead}, but collector checkout is ${checkoutHead}`);
  }
  if (manifest.servedVersion !== manifest.producerHead) {
    throw new Error(`Capture ${screen} producer ${manifest.producerHead} does not match served /version.txt ${manifest.servedVersion}`);
  }
  const result = { ...manifest, captureSet };
  provenance.set(screen, result);
  return result;
}
const producerHead = checkoutHead;
const pairs = [
  ['login-desktop', 'TASK-vd-evidence-frames/design-frames/desktop-02-лобби.png', 'Guest login; nearest desktop lobby frame'],
  ['login-mobile', 'TASK-vd-evidence-frames/design-frames/mobile-01-mobile-лобби-copy.png', 'Guest login; nearest mobile lobby frame'],
  ['lobby-desktop', 'TASK-vd-evidence-frames/design-frames/desktop-02-лобби.png', 'Lobby'],
  ['lobby-mobile', 'TASK-vd-evidence-frames/design-frames/mobile-01-mobile-лобби-copy.png', 'Lobby'],
  ['room-desktop', 'TASK-vd-evidence-frames/design-frames/desktop-03-комната-ожидания.png', 'Waiting room'],
  ['room-mobile', 'TASK-vd-evidence-frames/design-frames/mobile-02-mobile-комната-copy.png', 'Waiting room'],
  ['turn-order-desktop', 'TASK-vd-evidence-frames/design-frames/desktop-07-розыгрыш-порядка-ходов.png', 'Turn-order roll'],
  ['turn-order-mobile', 'TASK-vd-evidence-frames/design-frames/desktop-07-розыгрыш-порядка-ходов.png', 'Turn-order roll; nearest desktop frame'],
  ['create-room-desktop', 'TASK-vd-evidence-frames/design-frames/desktop-02-лобби.png', 'Create-room dialog'],
  ['create-room-mobile', 'TASK-vd-evidence-frames/design-frames/mobile-01-mobile-лобби-copy.png', 'Create-room bottom sheet'],
  ['game-desktop', 'TASK-vd-evidence-frames/design-frames/desktop-01-игровой-экран.png', 'Game screen'],
  ['board-mobile', 'TASK-vd-evidence-frames/design-frames/mobile-03-mobile-поле-copy.png', 'Mobile board and navigation'],
  ['assets-mobile', 'TASK-vd-evidence-frames/design-frames/mobile-04-mobile-мои-активы-copy.png', 'My assets'],
  ['journal-mobile', 'TASK-vd-evidence-frames/design-frames/mobile-05-mobile-журнал-и-чат-copy.png', 'Journal and chat'],
  ['more-mobile', 'TASK-vd-evidence-frames/design-frames/mobile-03-mobile-поле-copy.png', 'More navigation'],
  ['purchase-desktop', 'TASK-vd-evidence-frames/design-frames/desktop-04-покупка-карточка-при-попадании.png', 'Purchase response'],
  ['purchase-mobile', 'TASK-vd-evidence-frames/design-frames/mobile-06-mobile-покупка-copy.png', 'Purchase bottom sheet'],
  ['auction-desktop', 'TASK-vd-evidence-frames/design-frames/desktop-06-панель-аукциона.png', 'Auction response'],
  ['auction-mobile', 'TASK-vd-evidence-frames/design-frames/mobile-07-mobile-аукцион-copy.png', 'Auction bottom sheet'],
  ['jail-attempt-status-desktop', 'TASK-vd-evidence-frames/design-frames/desktop-08-тюрьма-казино-шанс.png', 'Jail attempt status; nearest temporary-jail frame'],
  ['jail-attempt-status-mobile', 'TASK-vd-evidence-frames/design-frames/mobile-03-mobile-поле-copy.png', 'Jail attempt status; nearest mobile board frame'],
  ['purchase-observer-mobile', 'TASK-vd-evidence-frames/design-frames/mobile-06-mobile-покупка-copy.png', 'Purchase status for another player'],
  ['auction-observer-mobile', 'TASK-vd-evidence-frames/design-frames/mobile-07-mobile-аукцион-copy.png', 'Auction status for another player'],
  ['asset-card-desktop', 'TASK-vd-evidence-frames/design-frames/desktop-05-карточка-актива-свой-актив.png', 'Asset inspection'],
  ['asset-card-mobile', 'TASK-vd-evidence-frames/design-frames/mobile-04-mobile-мои-активы-copy.png', 'Asset inspection; nearest My Assets frame'],
  ['rent-shortfall-desktop', 'TASK-vd-evidence-frames/design-frames/desktop-09-рента-долги-ошибки-связь.png', 'Rent shortfall'],
  ['rent-shortfall-mobile', 'TASK-vd-evidence-frames/design-frames/mobile-04-mobile-мои-активы-copy.png', 'Rent shortfall; nearest My Assets frame'],
  ['build-quota-toast-desktop', 'TASK-vd-evidence-frames/design-frames/desktop-09-рента-долги-ошибки-связь.png', 'Build quota rejection toast; nearest desktop-09 error frame'],
  ['build-quota-toast-mobile', 'TASK-vd-evidence-frames/design-frames/desktop-09-рента-долги-ошибки-связь.png', 'Build quota rejection toast; nearest desktop-09 frame for mobile'],
  ['reconnect-banner-desktop', 'TASK-vd-evidence-frames/design-frames/desktop-09-рента-долги-ошибки-связь.png', 'Reconnect banner; nearest desktop-09 connection frame'],
  ['reconnect-banner-mobile', 'TASK-vd-evidence-frames/design-frames/desktop-09-рента-долги-ошибки-связь.png', 'Reconnect banner; nearest desktop-09 frame for mobile'],
  ['liquidation-desktop', 'TASK-vd-evidence-frames/design-frames/desktop-09-рента-долги-ошибки-связь.png', 'Automatic liquidation summary'],
  ['liquidation-mobile', 'TASK-vd-evidence-frames/design-frames/mobile-04-mobile-мои-активы-copy.png', 'Automatic liquidation summary; nearest My Assets frame'],
  ['elimination-desktop', 'TASK-vd-evidence-frames/design-frames/desktop-01-игровой-экран.png', 'Eliminated viewer; nearest game frame'],
  ['elimination-mobile', 'TASK-vd-evidence-frames/design-frames/mobile-03-mobile-поле-copy.png', 'Eliminated viewer; nearest mobile board frame'],
  ['game-over-desktop', 'TASK-vd-evidence-frames/design-frames/desktop-10-итоги-партии.png', 'Game over'],
  ['game-over-mobile', 'TASK-vd-evidence-frames/design-frames/mobile-03-mobile-поле-copy.png', 'Game over; nearest mobile game frame'],
].map(([name, designSource, description]) => {
  const viewport = name.endsWith('-mobile') ? 'mobile' : 'desktop';
  const screen = name.replace(/-(desktop|mobile)$/, '');
  const captureSet = fixtureScreens.has(screen) ? 'captured-app-fixtures' : 'captured-app';
  return [name, screen, captureSet, viewport, designSource, description];
});

for (const [name, screen, captureSet, viewport, designSource] of pairs) {
  if (!provenance.has(screen)) readManifest(screen);
  const appSource = resolve(captureRoot, captureSet, `${screen}-${viewport}.png`);
  const designPath = resolve(evidenceRoot, designSource.replace(/^TASK-vd-evidence-frames\//, ''));
  assertNonBlankImage(readFileSync(appSource), `${name} app screenshot`);
  assertNonBlankImage(readFileSync(designPath), `${name} design frame`);
}

mkdirSync(out, { recursive: true });
const pairIndex = [];
const rows = pairs.map(([name, screen, captureSet, viewport, designSource, description]) => {
  const manifest = provenance.get(screen) ?? readManifest(screen);
  const app = resolve(captureRoot, captureSet, `${screen}-${viewport}.png`);
  const design = resolve(evidenceRoot, designSource.replace(/^TASK-vd-evidence-frames\//, ''));
  const appTarget = resolve(out, `${name}-app.png`);
  const designTarget = resolve(out, `${name}-design.png`);
  mkdirSync(dirname(appTarget), { recursive: true });
  copyFileSync(app, appTarget);
  copyFileSync(design, designTarget);
  const captureProducer = manifest.producerHead;
  const servedVersion = manifest.servedVersion;
  let indexed = pairIndex.find(row => row.screen === screen);
  if (!indexed) {
    indexed = { screen, producerHead: captureProducer, servedVersion, captureSet: manifest.captureSet, viewports: [] };
    pairIndex.push(indexed);
  }
  indexed.viewports.push(viewport);
  return `| ${screen} · ${viewport} | [App](./${name}-app.png) | [Design frame](./${name}-design.png) | ${captureProducer} | ${servedVersion} | ${description} |`;
});
writeFileSync(resolve(out, 'capture-manifest.json'), JSON.stringify({
  producerHead,
  pairs: pairIndex,
}, null, 2) + '\n');
writeFileSync(resolve(out, 'capture-manifest-provenance.json'), JSON.stringify({
  producerHead,
  manifests: [...provenance.values()].map(manifest => ({
    screen: manifest.screen,
    producerHead: manifest.producerHead,
    servedVersion: manifest.servedVersion,
    viewports: manifest.viewports,
    capturedAtUtc: manifest.capturedAtUtc,
  })),
}, null, 2) + '\n');
writeFileSync(resolve(out, 'README.md'), [
  '# Visual design screen pairs',
  '',
  `Screenshots at 1440×900 and 390×844 for handoff criteria C3 and C4. All app captures were produced from commit \`${producerHead}\`; each sidecar records the served \`/version.txt\`, which was verified to equal the producer commit. The collector rejects missing manifests, head/version mismatches and blank app or design images. “Nearest” labels identify states without an exact design frame; the pairing is an evidence aid, not an assertion that the states are identical.`,
  '',
  '| Screen | App capture | Design frame | Producer head | Served `/version.txt` | Pairing label |',
  '| --- | --- | --- | --- | --- | --- |',
  ...rows,
  '',
  '## Deviations',
  '',
  'The accepted rule is to follow implemented rules and available projection data; these evidence notes record the resulting differences from the design references.',
  '',
  '### Brief vs rules',
  '',
  '1. The capacity selector is omitted; rooms show current occupancy out of six.',
  '2. Joining by code means selecting a listed room and then entering its code.',
  '3. The players panel has no current-capital figure because the rules define no valuation method.',
  '4. There is no per-player disconnected badge because projections carry no presence data; a paused turn uses `pausedRemainingMs`.',
  '5. The purchase “decline” action is `StartAuction`; no decline command exists.',
  '',
  '### Design details not supplied by the current projection or rules',
  '',
  '- No room name or round counter is available; room labels are omitted and no round counter is shown.',
  '- The turn projection supplies the deadline but no stable total-duration field for the design progress bar.',
  '- Players use seat-colour initial avatars; avatar artwork is not supplied by the client.',
  '- Game-over data has no game duration or round count.',
  '- Restarting a finished game in the same room has no game rule or command.',
  '- The rent table’s percent-of-price values are derived from the core rent schedule and asset price; they are presentation values, not a separate rule field.',
  '',
  'The populated lobby capture shows an open room and a game in progress, both created by other actors before the viewer refreshed the list. The purchase pair is captured from its decider with a separate observer pair; the auction pair is captured from the current responding bidder.',
  '',
  '## Reproduction',
  '',
  'Run these commands from the task checkout. The compose projects use disposable databases and ports 8083–8085; the browser runs use one worker and write only to this task evidence folder:',
  '',
  `\`\`\`sh\nTASK_HEAD=$(git rev-parse HEAD)\nTASK_EVIDENCE=${evidenceRoot}\nsg docker -c "POSTGRES_PASSWORD=local-final-evidence GIT_SHA=$TASK_HEAD WEB_PORT=8083 docker compose -p vd-final-evidence up --build -d --wait"\nsg docker -c "POSTGRES_PASSWORD=local-final-evidence GIT_SHA=$TASK_HEAD WEB_PORT=8084 docker compose -p vd-final-evidence-fixtures -f docker-compose.yml -f docker-compose.fixtures.yml up --build -d --wait"\nsg docker -c "POSTGRES_PASSWORD=local-final-evidence GIT_SHA=$TASK_HEAD WEB_PORT=8085 docker compose -p vd-final-evidence-seeded -f docker-compose.yml -f docker-compose.e2e.yml up --build -d --wait"\n\ndocker run --rm --network host --group-add 111 -v "$PWD":/workspace -v "$TASK_EVIDENCE":/evidence -v /usr/bin/docker:/usr/bin/docker -v /var/run/docker.sock:/var/run/docker.sock -w /workspace -e GIT_CONFIG_COUNT=1 -e GIT_CONFIG_KEY_0=safe.directory -e GIT_CONFIG_VALUE_0=/workspace -e E2E_SCREEN_EVIDENCE=1 -e E2E_SCREEN_EVIDENCE_DIR=/evidence/screens/captured-app -e E2E_BASE_URL=http://127.0.0.1:8083 -e E2E_RECONNECT_STOP_COMMAND='docker compose -p vd-final-evidence stop server' -e E2E_RESTART_COMMAND='docker compose -p vd-final-evidence start server' mcr.microsoft.com/playwright:v1.58.2-noble ./node_modules/.bin/playwright test e2e/game-layout.spec.ts e2e/compose.spec.ts --workers=1\ndocker run --rm --network host --group-add 111 -v "$PWD":/workspace -v "$TASK_EVIDENCE":/evidence -w /workspace -e GIT_CONFIG_COUNT=1 -e GIT_CONFIG_KEY_0=safe.directory -e GIT_CONFIG_VALUE_0=/workspace -e E2E_SCREEN_EVIDENCE=1 -e E2E_SCREEN_EVIDENCE_DIR=/evidence/screens/captured-app -e E2E_DETERMINISTIC=1 -e E2E_BASE_URL=http://127.0.0.1:8085 mcr.microsoft.com/playwright:v1.58.2-noble ./node_modules/.bin/playwright test e2e/compose.spec.ts --grep 'seed 6689' --workers=1\ndocker run --rm --network host --group-add 111 -v "$PWD":/workspace -v "$TASK_EVIDENCE":/evidence -w /workspace -e GIT_CONFIG_COUNT=1 -e GIT_CONFIG_KEY_0=safe.directory -e GIT_CONFIG_VALUE_0=/workspace -e E2E_SCREEN_EVIDENCE=1 -e E2E_SCREEN_EVIDENCE_DIR=/evidence/screens/captured-app-fixtures -e E2E_FIXTURES=1 -e E2E_BASE_URL=http://127.0.0.1:8084 mcr.microsoft.com/playwright:v1.58.2-noble ./node_modules/.bin/playwright test e2e/stage4.spec.ts e2e/stage5.spec.ts --workers=1\ndocker run --rm -v "$PWD":/workspace -v "$TASK_EVIDENCE":/evidence -w /workspace mcr.microsoft.com/playwright:v1.58.2-noble node scripts/capture-design-frames.cjs /evidence/design-frames\nnode scripts/collect-visual-screens.mjs "$TASK_EVIDENCE" "$TASK_EVIDENCE/pairs"\n\`\`\``,
  '',
].join('\n'));
console.log(`Collected ${pairs.length} app/design pairs in ${out}`);
