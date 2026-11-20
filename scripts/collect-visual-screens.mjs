#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
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
const indexReadme = [
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
  '## Fixed in this task',
  '',
  'TASK-vd-layout-polish fixes the assigned presentation defects: rent and debt surfaces stay visible on desktop, jail attempt progress appears in the turn header, the board caption clears the journal, room names use a creator nickname or neutral label, and elimination balance is labeled.',
  '',
  '- **TL-approved addition:** desktop side columns stay within the viewport below the top bar. My Assets scrolls internally with keyboard focus and a visible token-colored scrollbar; Players uses the same containment when its roster overflows. Mobile layout is unchanged.',
  '- The liquidation fixture asserts that the page does not scroll while My Assets does.',
  '',
  '## Reproduction',
  '',
  'From the task checkout, follow the complete **Final visual-design evidence** recipe in `scripts/README.md`. It includes task-owned Docker networks, fresh task-local databases, standalone checkout mounts, the read-only fixture SQL command, and reconnect commands. The recipe runs the browser suites with one worker. To collect the captured files into this index:',
  '',
  `\`\`\`sh\nTASK_EVIDENCE=/srv/agents/evidence/TASK-vd-final-evidence\nnode scripts/collect-visual-screens.mjs "$TASK_EVIDENCE" "$TASK_EVIDENCE/pairs"\n\`\`\``,
  '',
].join('\n');
writeFileSync(resolve(out, 'README.md'), indexReadme);
const rootLinkPrefix = relative(evidenceRoot, out);
const rootIndexReadme = rootLinkPrefix
  ? indexReadme.replace(/\]\(\.\//g, `](./${rootLinkPrefix}/`)
  : indexReadme;
writeFileSync(resolve(evidenceRoot, 'README.md'), rootIndexReadme);

for (const indexPath of [resolve(out, 'README.md'), resolve(evidenceRoot, 'README.md')]) {
  const markdown = readFileSync(indexPath, 'utf8');
  const missing = [...markdown.matchAll(/\]\(([^)]+)\)/g)]
    .map(([, target]) => target)
    .filter(target => !/^(?:https?:|#)/.test(target))
    .map(target => resolve(dirname(indexPath), decodeURIComponent(target.split('#')[0])))
    .filter(target => !existsSync(target));
  if (missing.length) throw new Error(`Broken local links in ${indexPath}:\n${[...new Set(missing)].join('\n')}`);
}
console.log(`Collected ${pairs.length} app/design pairs in ${out}`);
