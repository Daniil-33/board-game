#!/usr/bin/env node
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const evidenceRoot = process.argv[2] ?? '/srv/agents/evidence';
const out = process.argv[3] ?? resolve(evidenceRoot, 'TASK-vd-e2e/screens');
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
  ['liquidation-desktop', 'TASK-vd-e2e/screens/captured-design-frames/desktop-09-рента-долги-ошибки-связь.png', 'Automatic liquidation summary'],
  ['liquidation-mobile', 'TASK-vd-e2e/screens/captured-design-frames/mobile-04-mobile-мои-активы-copy.png', 'Automatic liquidation summary; nearest My Assets frame'],
  ['elimination-desktop', 'TASK-vd-e2e/screens/captured-design-frames/desktop-01-игровой-экран.png', 'Eliminated viewer; nearest game frame'],
  ['elimination-mobile', 'TASK-vd-e2e/screens/captured-design-frames/mobile-03-mobile-поле-copy.png', 'Eliminated viewer; nearest mobile board frame'],
  ['game-over-desktop', 'TASK-vd-e2e/screens/captured-design-frames/desktop-10-итоги-партии.png', 'Game over'],
  ['game-over-mobile', 'TASK-vd-e2e/screens/captured-design-frames/mobile-03-mobile-поле-copy.png', 'Game over; nearest mobile game frame'],
].map(([name, designSource, description]) => {
  const viewport = name.endsWith('-mobile') ? 'mobile' : 'desktop';
  const screen = name.replace(/-(desktop|mobile)$/, '');
  const fixtureScreens = new Set(['asset-card', 'rent-shortfall', 'liquidation', 'elimination', 'game-over']);
  const captureSet = fixtureScreens.has(screen) ? 'captured-app-fixtures' : 'captured-app';
  return [name, `TASK-vd-e2e/screens/${captureSet}/${screen}-${viewport}.png`, designSource, description];
});

mkdirSync(out, { recursive: true });
const rows = pairs.map(([name, appSource, designSource, description]) => {
  const app = resolve(evidenceRoot, appSource);
  const design = resolve(evidenceRoot, designSource);
  const appTarget = resolve(out, `${name}-app.png`);
  const designTarget = resolve(out, `${name}-design.png`);
  mkdirSync(dirname(appTarget), { recursive: true });
  copyFileSync(app, appTarget);
  copyFileSync(design, designTarget);
  const sourceTask = appSource.split('/')[0];
  return `| ${description} | [App](./${name}-app.png) | ${sourceTask} | [Design frame](./${name}-design.png) |`;
});
writeFileSync(resolve(out, 'README.md'), [
  '# Visual design screen pairs',
  '',
  'Screenshots at 1440×900 and 390×844 for handoff criteria C3 and C4. Every app image was emitted by the env-gated Playwright flows committed in this task head, using the production web stack and the seeded fixture stack for fixture-only states. Each pair is captured from the same page state at both viewports. No client/product code changed in TASK-vd-e2e. Design frames were captured by opening the supplied HTML exports in Chromium as specified in `docs/efforts/visual-design/design.md`. “Nearest” labels identify states without an exact design frame; the pairing is an evidence aid, not an assertion that the states are identical.',
  '',
  '| Screen | App capture | App source task | Design frame |',
  '| --- | --- | --- | --- |',
  ...rows,
  '',
  'Board-colour defect: TASK-vd-board-colors fixed the missing production group strips and corner gradients in PR #100; these current-head Playwright captures show the fixed production stack.',
  '',
  'Staging render (production, 1440×900, version `e2ead69340db160cb37239154aeb8a29e3193198`): [board with group strips and corner gradients](../../TASK-vd-board/staging-render.png).',
  '',
  'App source captures were produced by committed head `86b010088c1257ca5a46edd6eac209cb58750593` in Playwright 1.58.2; both local web stacks report product version `e01304f`. The exact capture runs, viewports, and log paths are in [capture-manifest.json](./capture-manifest.json).',
  '',
  `Capture the design frames in the Playwright 1.58.2 container with \`node scripts/capture-design-frames.cjs /evidence/captured-design-frames\`, then regenerate the pairs with \`node scripts/collect-visual-screens.mjs ${evidenceRoot} ${out}\`. Current-head app source PNGs are retained in \`captured-app/\` and \`captured-app-fixtures/\`.`,
  '',
].join('\n'));
console.log(`Collected ${pairs.length} app/design pairs in ${out}`);
