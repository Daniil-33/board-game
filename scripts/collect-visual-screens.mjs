#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const evidenceRoot = process.argv[2] ?? '/srv/agents/evidence';
const out = process.argv[3] ?? resolve(evidenceRoot, 'TASK-vd-toast-copy/screens');
const checkoutHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const provenance = [
  ['TASK-vd-toast-copy/screens/captured-app-fixtures/capture-manifest-build-quota-toast.json', 'build-quota-toast'],
  ['TASK-vd-toast-copy/screens/captured-app/capture-manifest-reconnect-banner.json', 'reconnect-banner'],
].map(([path, screen]) => {
  const manifest = JSON.parse(readFileSync(resolve(evidenceRoot, path), 'utf8'));
  if (manifest.screen !== screen || !Array.isArray(manifest.viewports)
    || !manifest.viewports.includes('desktop') || !manifest.viewports.includes('mobile')) {
    throw new Error(`Invalid capture provenance for ${screen}`);
  }
  if (manifest.producerHead !== checkoutHead) {
    throw new Error(`Capture ${screen} was produced by ${manifest.producerHead}, but collector checkout is ${checkoutHead}`);
  }
  if (typeof manifest.servedVersion !== 'string' || manifest.servedVersion.length === 0) {
    throw new Error(`Capture ${screen} has no served /version.txt value`);
  }
  return manifest;
});
const producerHead = checkoutHead;
const pairs = [
  ['login-desktop', 'TASK-vd-e2e/screens/captured-design-frames/desktop-02-лобби.png', 'Guest login; nearest desktop lobby frame'],
  ['login-mobile', 'TASK-vd-e2e/screens/captured-design-frames/mobile-01-mobile-лобби-copy.png', 'Guest login; nearest mobile lobby frame'],
  ['lobby-desktop', 'TASK-vd-e2e/screens/captured-design-frames/desktop-02-лобби.png', 'Lobby'],
  ['lobby-mobile', 'TASK-vd-e2e/screens/captured-design-frames/mobile-01-mobile-лобби-copy.png', 'Lobby'],
  ['room-desktop', 'TASK-vd-e2e/screens/captured-design-frames/desktop-03-комната-ожидания.png', 'Waiting room'],
  ['room-mobile', 'TASK-vd-e2e/screens/captured-design-frames/mobile-02-mobile-комната-copy.png', 'Waiting room'],
  ['turn-order-desktop', 'TASK-vd-e2e/screens/captured-design-frames/desktop-07-розыгрыш-порядка-ходов.png', 'Turn-order roll'],
  ['turn-order-mobile', 'TASK-vd-e2e/screens/captured-design-frames/desktop-07-розыгрыш-порядка-ходов.png', 'Turn-order roll; nearest desktop frame'],
  ['create-room-desktop', 'TASK-vd-e2e/screens/captured-design-frames/desktop-02-лобби.png', 'Create-room dialog'],
  ['create-room-mobile', 'TASK-vd-e2e/screens/captured-design-frames/mobile-01-mobile-лобби-copy.png', 'Create-room bottom sheet'],
  ['game-desktop', 'TASK-vd-e2e/screens/captured-design-frames/desktop-01-игровой-экран.png', 'Game screen'],
  ['board-mobile', 'TASK-vd-e2e/screens/captured-design-frames/mobile-03-mobile-поле-copy.png', 'Mobile board and navigation'],
  ['assets-mobile', 'TASK-vd-e2e/screens/captured-design-frames/mobile-04-mobile-мои-активы-copy.png', 'My assets'],
  ['journal-mobile', 'TASK-vd-e2e/screens/captured-design-frames/mobile-05-mobile-журнал-и-чат-copy.png', 'Journal and chat'],
  ['more-mobile', 'TASK-vd-e2e/screens/captured-design-frames/mobile-03-mobile-поле-copy.png', 'More navigation'],
  ['purchase-desktop', 'TASK-vd-e2e/screens/captured-design-frames/desktop-04-покупка-карточка-при-попадании.png', 'Purchase response'],
  ['purchase-mobile', 'TASK-vd-e2e/screens/captured-design-frames/mobile-06-mobile-покупка-copy.png', 'Purchase bottom sheet'],
  ['auction-desktop', 'TASK-vd-e2e/screens/captured-design-frames/desktop-06-панель-аукциона.png', 'Auction response'],
  ['auction-mobile', 'TASK-vd-e2e/screens/captured-design-frames/mobile-07-mobile-аукцион-copy.png', 'Auction bottom sheet'],
  ['purchase-observer-mobile', 'TASK-vd-e2e/screens/captured-design-frames/mobile-06-mobile-покупка-copy.png', 'Purchase status for another player'],
  ['auction-observer-mobile', 'TASK-vd-e2e/screens/captured-design-frames/mobile-07-mobile-аукцион-copy.png', 'Auction status for another player'],
  ['asset-card-desktop', 'TASK-vd-e2e/screens/captured-design-frames/desktop-05-карточка-актива-свой-актив.png', 'Asset inspection'],
  ['asset-card-mobile', 'TASK-vd-e2e/screens/captured-design-frames/mobile-04-mobile-мои-активы-copy.png', 'Asset inspection; nearest My Assets frame'],
  ['rent-shortfall-desktop', 'TASK-vd-e2e/screens/captured-design-frames/desktop-09-рента-долги-ошибки-связь.png', 'Rent shortfall'],
  ['rent-shortfall-mobile', 'TASK-vd-e2e/screens/captured-design-frames/mobile-04-mobile-мои-активы-copy.png', 'Rent shortfall; nearest My Assets frame'],
  ['build-quota-toast-desktop', 'TASK-vd-e2e/screens/captured-design-frames/desktop-09-рента-долги-ошибки-связь.png', 'Build quota rejection toast; nearest desktop-09 error frame'],
  ['build-quota-toast-mobile', 'TASK-vd-e2e/screens/captured-design-frames/desktop-09-рента-долги-ошибки-связь.png', 'Build quota rejection toast; nearest desktop-09 frame for mobile'],
  ['reconnect-banner-desktop', 'TASK-vd-e2e/screens/captured-design-frames/desktop-09-рента-долги-ошибки-связь.png', 'Reconnect banner; nearest desktop-09 connection frame'],
  ['reconnect-banner-mobile', 'TASK-vd-e2e/screens/captured-design-frames/desktop-09-рента-долги-ошибки-связь.png', 'Reconnect banner; nearest desktop-09 frame for mobile'],
  ['liquidation-desktop', 'TASK-vd-e2e/screens/captured-design-frames/desktop-09-рента-долги-ошибки-связь.png', 'Automatic liquidation summary'],
  ['liquidation-mobile', 'TASK-vd-e2e/screens/captured-design-frames/mobile-04-mobile-мои-активы-copy.png', 'Automatic liquidation summary; nearest My Assets frame'],
  ['elimination-desktop', 'TASK-vd-e2e/screens/captured-design-frames/desktop-01-игровой-экран.png', 'Eliminated viewer; nearest game frame'],
  ['elimination-mobile', 'TASK-vd-e2e/screens/captured-design-frames/mobile-03-mobile-поле-copy.png', 'Eliminated viewer; nearest mobile board frame'],
  ['game-over-desktop', 'TASK-vd-e2e/screens/captured-design-frames/desktop-10-итоги-партии.png', 'Game over'],
  ['game-over-mobile', 'TASK-vd-e2e/screens/captured-design-frames/mobile-03-mobile-поле-copy.png', 'Game over; nearest mobile game frame'],
].map(([name, designSource, description]) => {
  const viewport = name.endsWith('-mobile') ? 'mobile' : 'desktop';
  const screen = name.replace(/-(desktop|mobile)$/, '');
  const fixtureScreens = new Set(['asset-card', 'rent-shortfall', 'build-quota-toast', 'liquidation', 'elimination', 'game-over']);
  const captureSet = fixtureScreens.has(screen) ? 'captured-app-fixtures' : 'captured-app';
  return [name, screen, captureSet, viewport, designSource, description];
});

mkdirSync(out, { recursive: true });
const pairIndex = [];
const rows = pairs.map(([name, screen, captureSet, viewport, designSource, description]) => {
  const taskAppSource = `TASK-vd-toast-copy/screens/${captureSet}/${screen}-${viewport}.png`;
  const legacyAppSource = `TASK-vd-e2e/screens/${captureSet}/${screen}-${viewport}.png`;
  const appSource = existsSync(resolve(evidenceRoot, taskAppSource)) ? taskAppSource : legacyAppSource;
  const app = resolve(evidenceRoot, appSource);
  const design = resolve(evidenceRoot, designSource);
  const appTarget = resolve(out, `${name}-app.png`);
  const designTarget = resolve(out, `${name}-design.png`);
  mkdirSync(dirname(appTarget), { recursive: true });
  copyFileSync(app, appTarget);
  copyFileSync(design, designTarget);
  const manifestDir = appSource === taskAppSource ? 'TASK-vd-toast-copy/screens' : 'TASK-vd-e2e/screens';
  const manifestPath = resolve(evidenceRoot, manifestDir, captureSet, `capture-manifest-${screen}.json`);
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : null;
  const captureProducer = manifest?.screen === screen && typeof manifest.producerHead === 'string'
    ? manifest.producerHead
    : 'TASK-vd-e2e (a0ed3fc)';
  const servedVersion = typeof manifest?.servedVersion === 'string' ? manifest.servedVersion : 'not recorded';
  let indexed = pairIndex.find(row => row.screen === screen);
  if (!indexed) {
    indexed = { screen, producer: captureProducer, servedVersion, sourceTask: manifestDir.includes('TASK-vd-toast-copy') ? 'TASK-vd-toast-copy' : 'TASK-vd-e2e', viewports: [] };
    pairIndex.push(indexed);
  }
  indexed.viewports.push(viewport);
  return `| ${description} | [App](./${name}-app.png) | ${captureProducer} | ${servedVersion} | [Design frame](./${name}-design.png) |`;
});
writeFileSync(resolve(out, 'capture-manifest.json'), JSON.stringify({
  producerHead,
  pairs: pairIndex,
}, null, 2) + '\n');
writeFileSync(resolve(out, 'capture-manifest-provenance.json'), JSON.stringify({
  producerHead,
  manifests: provenance.map(manifest => ({
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
  'Screenshots at 1440×900 and 390×844 for handoff criteria C3 and C4. The provenance column shows the producer commit from a per-screen sidecar, or identifies legacy TASK-vd-e2e evidence where no sidecar exists. Each pair is captured from the same page state at both viewports. Design frames were captured by opening the supplied HTML exports in Chromium as specified in `docs/efforts/visual-design/design.md`. “Nearest” labels identify states without an exact design frame; the pairing is an evidence aid, not an assertion that the states are identical.',
  '',
  '| Screen | App capture | App capture producer | Served `/version.txt` | Design frame |',
  '| --- | --- | --- | --- | --- |',
  ...rows,
  '',
  'Board-colour defect: TASK-vd-board-colors fixed the missing production group strips and corner gradients in PR #100; the board captures listed above (see their provenance column) show the fixed production stack.',
  '',
  'Staging render (production, 1440×900, version `e2ead69340db160cb37239154aeb8a29e3193198`): [board with group strips and corner gradients](../../TASK-vd-board/staging-render.png).',
  '',
  'The build-quota toast and reconnect-banner app captures were produced by committed head `' + producerHead + '` in Playwright 1.58.2; their per-screen producer manifests record both review viewports and served `/version.txt`. The original TASK-vd-e2e `capture-manifest.json` index was replaced by the first collector version in commit `501ed49`; earlier run and log references remain in [the verification index](../verification.md). This task writes its pair index and provenance manifests only inside its output directory.',
  '',
  `Capture the design frames in the Playwright 1.58.2 container with \`node scripts/capture-design-frames.cjs /evidence/captured-design-frames\`, then regenerate the pairs with \`node scripts/collect-visual-screens.mjs ${evidenceRoot} ${out}\`. Each row is labeled from its per-screen sidecar; sources without one are marked \`TASK-vd-e2e (a0ed3fc)\`. The pair index records the producer head and served version for each screen.`,
  '',
].join('\n'));
console.log(`Collected ${pairs.length} app/design pairs in ${out}`);
