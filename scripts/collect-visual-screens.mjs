#!/usr/bin/env node
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const evidenceRoot = process.argv[2] ?? '/srv/agents/evidence';
const out = process.argv[3] ?? resolve(evidenceRoot, 'TASK-vd-e2e/screens');
const pairs = [
  ['login-desktop', 'TASK-vd-shell-pages/app-login-desktop.png', 'TASK-vd-e2e/screens/captured-design-frames/desktop-02-лобби.png', 'Guest login; nearest desktop lobby frame'],
  ['login-mobile', 'TASK-vd-shell-pages/app-login-mobile.png', 'TASK-vd-e2e/screens/captured-design-frames/mobile-01-mobile-лобби-copy.png', 'Guest login; nearest mobile lobby frame'],
  ['lobby-desktop', 'TASK-vd-shell-pages/app-lobby-desktop.png', 'TASK-vd-e2e/screens/captured-design-frames/desktop-02-лобби.png', 'Lobby'],
  ['lobby-mobile', 'TASK-vd-shell-pages/app-lobby-mobile.png', 'TASK-vd-e2e/screens/captured-design-frames/mobile-01-mobile-лобби-copy.png', 'Lobby'],
  ['room-desktop', 'TASK-vd-shell-pages/app-room-desktop.png', 'TASK-vd-e2e/screens/captured-design-frames/desktop-03-комната-ожидания.png', 'Waiting room'],
  ['room-mobile', 'TASK-vd-shell-pages/app-room-mobile.png', 'TASK-vd-e2e/screens/captured-design-frames/mobile-02-mobile-комната-copy.png', 'Waiting room'],
  ['turn-order-desktop', 'TASK-vd-shell-pages/app-setup-desktop.png', 'TASK-vd-e2e/screens/captured-design-frames/desktop-07-розыгрыш-порядка-ходов.png', 'Turn-order roll'],
  ['turn-order-mobile', 'TASK-vd-shell-pages/app-setup-mobile.png', 'TASK-vd-e2e/screens/captured-design-frames/desktop-07-розыгрыш-порядка-ходов.png', 'Turn-order roll; nearest desktop frame'],
  ['create-room-desktop', 'TASK-vd-shell-pages/app-create-desktop.png', 'TASK-vd-e2e/screens/captured-design-frames/desktop-02-лобби.png', 'Create-room dialog'],
  ['create-room-mobile', 'TASK-vd-shell-pages/app-create-mobile.png', 'TASK-vd-e2e/screens/captured-design-frames/mobile-01-mobile-лобби-copy.png', 'Create-room bottom sheet'],
  ['game-desktop', 'TASK-vd-game-layout/app-desktop.png', 'TASK-vd-e2e/screens/captured-design-frames/desktop-01-игровой-экран.png', 'Game screen'],
  ['board-mobile', 'TASK-vd-game-layout/app-mobile-board.png', 'TASK-vd-e2e/screens/captured-design-frames/mobile-03-mobile-поле-copy.png', 'Mobile board and navigation'],
  ['assets-mobile', 'TASK-vd-game-layout/app-mobile-assets.png', 'TASK-vd-e2e/screens/captured-design-frames/mobile-04-mobile-мои-активы-copy.png', 'My assets'],
  ['journal-mobile', 'TASK-vd-game-layout/app-mobile-journal.png', 'TASK-vd-e2e/screens/captured-design-frames/mobile-05-mobile-журнал-и-чат-copy.png', 'Journal and chat'],
  ['more-mobile', 'TASK-vd-game-layout/app-mobile-more.png', 'TASK-vd-e2e/screens/captured-design-frames/mobile-03-mobile-поле-copy.png', 'More navigation'],
  ['purchase-desktop', 'TASK-vd-game-dialogs/screenshots/purchase/1440x900.png', 'TASK-vd-e2e/screens/captured-design-frames/desktop-04-покупка-карточка-при-попадании.png', 'Purchase response'],
  ['purchase-mobile', 'TASK-vd-game-dialogs/screenshots/purchase/390x844.png', 'TASK-vd-e2e/screens/captured-design-frames/mobile-06-mobile-покупка-copy.png', 'Purchase bottom sheet'],
  ['auction-desktop', 'TASK-vd-game-dialogs/screenshots/auction/1440x900.png', 'TASK-vd-e2e/screens/captured-design-frames/desktop-06-панель-аукциона.png', 'Auction response'],
  ['auction-mobile', 'TASK-vd-game-dialogs/screenshots/auction/390x844.png', 'TASK-vd-e2e/screens/captured-design-frames/mobile-07-mobile-аукцион-copy.png', 'Auction bottom sheet'],
  ['purchase-observer-mobile', 'TASK-vd-dialogs-followup/purchase-bystander-mobile-390x844.png', 'TASK-vd-e2e/screens/captured-design-frames/mobile-06-mobile-покупка-copy.png', 'Purchase status for another player'],
  ['auction-observer-mobile', 'TASK-vd-dialogs-followup/auction-bystander-mobile-390x844.png', 'TASK-vd-e2e/screens/captured-design-frames/mobile-07-mobile-аукцион-copy.png', 'Auction status for another player'],
  ['asset-card-desktop', 'TASK-vd-game-dialogs/screenshots/asset-inspection/1440x900.png', 'TASK-vd-e2e/screens/captured-design-frames/desktop-05-карточка-актива-свой-актив.png', 'Asset inspection'],
  ['asset-card-mobile', 'TASK-vd-game-dialogs/screenshots/asset-inspection/390x844.png', 'TASK-vd-e2e/screens/captured-design-frames/mobile-04-mobile-мои-активы-copy.png', 'Asset inspection; nearest My Assets frame'],
  ['rent-shortfall-desktop', 'TASK-vd-game-dialogs/screenshots/rent-shortfall/1440x900.png', 'TASK-vd-e2e/screens/captured-design-frames/desktop-09-рента-долги-ошибки-связь.png', 'Rent shortfall'],
  ['rent-shortfall-mobile', 'TASK-vd-game-dialogs/screenshots/rent-shortfall/390x844.png', 'TASK-vd-e2e/screens/captured-design-frames/mobile-04-mobile-мои-активы-copy.png', 'Rent shortfall; nearest My Assets frame'],
  ['liquidation-desktop', 'TASK-vd-game-dialogs/screenshots/liquidation/1440x900.png', 'TASK-vd-e2e/screens/captured-design-frames/desktop-09-рента-долги-ошибки-связь.png', 'Automatic liquidation summary'],
  ['liquidation-mobile', 'TASK-vd-game-dialogs/screenshots/liquidation/390x844.png', 'TASK-vd-e2e/screens/captured-design-frames/mobile-04-mobile-мои-активы-copy.png', 'Automatic liquidation summary; nearest My Assets frame'],
  ['elimination-desktop', 'TASK-vd-game-dialogs/screenshots/elimination/1440x900.png', 'TASK-vd-e2e/screens/captured-design-frames/desktop-01-игровой-экран.png', 'Eliminated viewer; nearest game frame'],
  ['elimination-mobile', 'TASK-vd-game-dialogs/screenshots/elimination/390x844.png', 'TASK-vd-e2e/screens/captured-design-frames/mobile-03-mobile-поле-copy.png', 'Eliminated viewer; nearest mobile board frame'],
  ['game-over-desktop', 'TASK-vd-game-dialogs/screenshots/game-over/1440x900.png', 'TASK-vd-e2e/screens/captured-design-frames/desktop-10-итоги-партии.png', 'Game over'],
  ['game-over-mobile', 'TASK-vd-game-dialogs/screenshots/game-over/390x844.png', 'TASK-vd-e2e/screens/captured-design-frames/mobile-03-mobile-поле-copy.png', 'Game over; nearest mobile game frame'],
];

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
  'Screenshots at 1440×900 and 390×844 for handoff criteria C3 and C4. App captures come from the durable evidence of their originating tasks; each source task README records the local Playwright stack and viewport. No client/product code changed in TASK-vd-e2e. Design frames were captured by opening the supplied HTML exports in Chromium as specified in `docs/efforts/visual-design/design.md`. “Nearest” labels identify states without an exact design frame; the pairing is an evidence aid, not an assertion that the states are identical.',
  '',
  '| Screen | App capture | App source task | Design frame |',
  '| --- | --- | --- | --- |',
  ...rows,
  '',
  `Capture the design frames in the Playwright 1.58.2 container with \`node scripts/capture-design-frames.cjs /evidence/captured-design-frames\`, then regenerate the pairs with \`node scripts/collect-visual-screens.mjs ${evidenceRoot} ${out}\`. App captures are retained under their originating TASK evidence directories.`,
  '',
].join('\n'));
console.log(`Collected ${pairs.length} app/design pairs in ${out}`);
