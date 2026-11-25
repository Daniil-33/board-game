import { mkdirSync, writeFileSync } from 'node:fs';
import { join as pathJoin } from 'node:path';
import type { GameEvent } from '../packages/game-core/src/index';
import { test, expect, sel, active, captureScreens, type Actor } from './helpers';
import { load, click, card, close, fast, balances } from './fixture-helpers';
import { cellRect } from '../apps/client/src/widgets/board/layout';

test.beforeEach(() => test.skip(process.env['E2E_FIXTURES'] !== '1', 'Requires isolated deterministic fixture stack'));

function eventSeenByAll(players: Actor[], type: string): GameEvent {
  const found = players.map(player => player.events.findLast(entry => entry.event.type === type)?.event);
  expect(found[0], `${type} emitted`).toBeDefined();
  for (const event of found) expect(event).toEqual(found[0]);
  return found[0]!;
}

async function sampleBoardCanvas(page: Actor['page']) {
  const canvas = page.locator(sel('board-canvas'));
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute('data-board-size', '660');
  await canvas.evaluate(element => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const box = await canvas.boundingBox();
  expect(box, 'board canvas has a measurable box').not.toBeNull();
  const png = (await canvas.screenshot()).toString('base64');
  const points: Array<[number, number]> = Array.from({ length: 40 }, (_, cell) => {
    const rect = cellRect(cell, 660);
    return [(rect.x + rect.width / 2) / 660, (rect.y + rect.height / 2) / 660];
  });
  return page.evaluate(async ({ encoded, points, box }) => {
    const image = new Image();
    image.src = `data:image/png;base64,${encoded}`;
    await image.decode();
    const sample = document.createElement('canvas');
    sample.width = image.width; sample.height = image.height;
    const context = sample.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const rgba = points.map(([x, y]) => [...context.getImageData(Math.floor(image.width * x), Math.floor(image.height * y), 1, 1).data]);
    const opaqueSamples = rgba.filter(pixel => pixel[3] === 255).length;
    const distinctColors = new Set(rgba.map(pixel => pixel.slice(0, 3).join(','))).size;
    return { box, samples: rgba.length, opaqueSamples, distinctColors, rgba };
  }, { encoded: png, points, box: box! });
}

async function responsiveGeometry(page: Actor['page'], selector: string) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  return page.locator(selector).first().evaluate(element => {
    const root = element.closest('.ds-dialog') ?? element.closest('.game-dialogs') ?? element;
    const rect = root.getBoundingClientRect();
    const style = getComputedStyle(root);
    return { x: rect.x, y: rect.y, right: rect.right, width: rect.width, bottom: rect.bottom,
      viewportWidth: innerWidth, viewportHeight: innerHeight, position: style.position,
      transform: style.transform, documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) };
  });
}

async function exerciseMobileLayouts(page: Actor['page'], selector: string, name: string, centeredDesktop = true, sheet = false) {
  const screenshots: Array<{ state: string; path: string; board?: Awaited<ReturnType<typeof sampleBoardCanvas>> }> = [];
  const measure = async (state: string) => {
    await expect(page.locator(selector).first()).toBeVisible();
    const geometry = await responsiveGeometry(page, selector);
    let board: Awaited<ReturnType<typeof sampleBoardCanvas>> | undefined;
    if (geometry.viewportWidth === 390 && geometry.viewportHeight === 844) {
      board = await sampleBoardCanvas(page);
      expect(board.opaqueSamples, `${name} ${state}: every sampled board cell is opaque`).toBe(board.samples);
      expect(board.distinctColors, `${name} ${state}: sampled board cells are drawn`).toBeGreaterThanOrEqual(8);
    }
    if (geometry.viewportWidth === 390) {
      expect(geometry.x, `${name} ${state}: left edge inside mobile viewport`).toBeGreaterThanOrEqual(0);
      expect(geometry.right, `${name} ${state}: right edge inside mobile viewport`).toBeLessThanOrEqual(390);
      expect(geometry.documentWidth, `${name} ${state}: no horizontal page scroll`).toBeLessThanOrEqual(390);
      if (sheet) expect(['none', 'matrix(1, 0, 0, 1, 0, 0)'], `${name} ${state}: sheet cancels desktop centring`)
        .toContain(geometry.transform);
    }
    if (state === 'desktop-1440x900' && centeredDesktop) {
      expect((geometry.x + geometry.right) / 2, `${name}: desktop horizontal centring`).toBeCloseTo(720, 0);
      expect((geometry.y + geometry.bottom) / 2, `${name}: desktop vertical centring`).toBeCloseTo(450, 0);
    }
    const dir = process.env['E2E_RESPONSIVE_EVIDENCE_DIR'];
    if (process.env['E2E_SCREEN_EVIDENCE'] === '1' && dir) {
      mkdirSync(dir, { recursive: true });
      const file = `${name}-${state}.png`;
      const path = pathJoin(dir, file);
      await page.screenshot({ path, fullPage: false });
      screenshots.push({ state, path, ...(board === undefined ? {} : { board }) });
    }
    return board === undefined ? geometry : { ...geometry, board };
  };

  const direct = await measure('direct-390x844');
  await page.setViewportSize({ width: 1440, height: 900 });
  const desktop = await measure('desktop-1440x900');
  await page.setViewportSize({ width: 390, height: 844 });
  const desktopResize = await measure('resize-1440x900-to-390x844');
  await page.setViewportSize({ width: 844, height: 390 });
  const landscape = await measure('landscape-844x390');
  await page.setViewportSize({ width: 390, height: 844 });
  const rotation = await measure('rotation-844x390-to-390x844');
  const dir = process.env['E2E_RESPONSIVE_EVIDENCE_DIR'];
  if (process.env['E2E_SCREEN_EVIDENCE'] === '1' && dir) {
    writeFileSync(pathJoin(dir, `${name}-geometry.json`), JSON.stringify({ direct, desktop, desktopResize, landscape, rotation, screenshots }, null, 2) + '\n');
  }
  return { direct, desktop, desktopResize, landscape, rotation };
}

test('S3 a double landing on cell 30 sends the player to jail without a bonus', async ({ actors }) => {
  const startedAt = Date.now();
  const players = await actors(3);
  await load(players, 'pre-roll-go-to-jail-double4');
  const actor = await active(players);
  const start = actor.events.length;
  await click(players, actor, 'RollDice');
  const events = actor.events.slice(start).map(entry => entry.event);
  const roll = events.find(event => event.type === 'DiceRolled')?.payload as { dice: number[] } | undefined;
  expect(roll?.dice).toEqual([2, 2]);
  expect(events.map(event => event.type)).toEqual(['DiceRolled', 'PlayerMoved', 'SentToJail', 'TurnEnded', 'TurnStarted']);
  expect(events.find(event => event.type === 'SentToJail')!.payload).toMatchObject({ playerId: actor.id, from: 30, to: 10 });
  expect(actor.view!.jail[actor.id]).toEqual({ attemptsUsed: 0 });
  expect(actor.view!.turn!.playerId).not.toBe(actor.id);
  expect(actor.view!.turn!.pendingBonus).toBe(false);
  for (const player of players) {
    expect(player.view!.jail[actor.id]).toEqual({ attemptsUsed: 0 });
    expect(player.view!.turn!.pendingBonus).toBe(false);
    await expect(player.page.locator(sel('order-entry')).filter({ hasText: `Player ${players.indexOf(actor) + 1}` }).locator(sel('jail')))
      .toHaveText('В тюрьме · 0/3');
  }
  expectBeforeFixtureTimeout(startedAt);
});


function expectBeforeFixtureTimeout(startedAt: number) {
  expect(Date.now() - startedAt, 'isolated fixture scenario finishes before its 45-second turn timer can draw entropy')
    .toBeLessThan(45_000);
}

async function casinoOutcome(players: Actor[], expectedWin: boolean, capture: boolean) {
  const startedAt = Date.now();
  await Promise.all(players.map(player => player.page.setViewportSize({ width: 390, height: 844 })));
  await load(players, 'casino-decision');
  const gambler = await active(players);
  const before = { ...gambler.view!.balances };
  await expect(gambler.page.locator(sel('casino-panel'))).toBeVisible();
  if (capture) await captureScreens(gambler.page, 'casino-dialog');
  await click(players, gambler, 'casino-bet');
  const resolved = eventSeenByAll(players, 'CasinoResolved');
  const payload = resolved.payload as { playerId: string; amount: number; won: boolean; balance: number };
  expect(payload).toMatchObject({ playerId: gambler.id, amount: 10, won: expectedWin });
  const expected = { ...before, [gambler.id]: before[gambler.id]! + (expectedWin ? 10 : -10) };
  await balances(players, expected);
  for (const player of players) {
    await expect(player.page.locator(sel('special-event-reveal'))).toContainText(expectedWin ? 'Выигрыш' : 'Проигрыш');
  }
  await exerciseMobileLayouts(gambler.page, '.game-dialogs', 'casino-result', true);
  expectBeforeFixtureTimeout(startedAt);
}

test('S1 casino win is public and settles balances for all three clients', async ({ actors }) => {
  await casinoOutcome(await actors(3), true, true);
});

test('S1 casino loss is public and settles balances for all three clients', async ({ actors }) => {
  await casinoOutcome(await actors(3), false, false);
});

async function chanceCard(players: Actor[], expectedCard: 'gain-5' | 'loss-5') {
  const startedAt = Date.now();
  await Promise.all(players.map(player => player.page.setViewportSize({ width: 390, height: 844 })));
  await load(players, 'chance-liquidation');
  const actor = await active(players);
  const before = { ...actor.view!.balances };
  await click(players, actor, 'RollDice');
  const roll = eventSeenByAll(players, 'DiceRolled').payload as { playerId: string; dice: number[] };
  expect(roll).toMatchObject({ playerId: actor.id, dice: expectedCard === 'gain-5' ? [4, 3] : [6, 1] });
  const drawn = eventSeenByAll(players, 'ChanceDrawn');
  const cardPayload = drawn.payload as { playerId: string; card: string; amount: number };
  expect(cardPayload).toMatchObject({ playerId: actor.id, card: expectedCard });
  if (expectedCard === 'gain-5') {
    const expected = { ...before, [actor.id]: before[actor.id]! + cardPayload.amount };
    await balances(players, expected);
    for (const player of players) await expect(player.page.locator(sel('special-event-reveal'))).toContainText('капитала');
    await exerciseMobileLayouts(actor.page, '.game-dialogs', 'chance-gain', true);
  } else {
    expect(actor.view!.charge?.payerId).toBe(actor.id);
    await expect(actor.page.locator(sel('special-event-reveal'))).toContainText('капитала');
    await expect(actor.page.locator(sel('bank-charge'))).toBeVisible();
    for (const observer of players.filter(player => player !== actor)) {
      await expect(observer.page.locator(sel('special-event-reveal'))).toContainText('капитала');
      await expect(observer.page.locator(sel('charge-status'))).toBeVisible();
    }
    await captureScreens(actor.page, 'chance-card', ['mobile', 'desktop']);
    await exerciseMobileLayouts(actor.page, '.game-dialogs', 'chance-loss-charge', true, true);
    await click(players, actor, 'pay-charge');
    const liquidation = players[0]!.events.findLast(entry =>
      ['AssetMortgaged', 'HouseSold'].includes(entry.event.type) && (entry.event.payload as { auto?: boolean }).auto === true)?.event;
    expect(liquidation, 'PayCharge includes at least one automatic liquidation').toBeDefined();
    for (const player of players) expect(player.events.findLast(entry => entry.event.type === liquidation!.type)?.event).toEqual(liquidation);
    expect(eventSeenByAll(players, 'ChargePaid').payload).toMatchObject({ payerId: actor.id });
  }
  expectBeforeFixtureTimeout(startedAt);
}

test('S2 positive chance gain is public on all three clients', async ({ actors }) => {
  await chanceCard(await actors(3), 'gain-5');
});

test('S2 negative chance loss is paid through automatic liquidation on all three clients', async ({ actors }) => {
  await chanceCard(await actors(3), 'loss-5');
});

test('RVW-002 mobile casino decision stays inside the viewport without a result reveal', async ({ actors }) => {
  const players = await actors(3);
  await Promise.all(players.map(player => player.page.setViewportSize({ width: 390, height: 844 })));
  await load(players, 'casino-decision');
  const gambler = await active(players);
  await expect(gambler.page.locator(sel('casino-panel'))).toBeVisible();
  await expect(gambler.page.locator(sel('special-event-reveal'))).toHaveCount(0);
  await exerciseMobileLayouts(gambler.page, sel('casino-panel'), 'casino-decision-no-reveal', true);
});

test('S3 a jailed player released by a double moves with no bonus', async ({ actors }) => {
  const startedAt = Date.now();
  const players = await actors(3);
  await load(players, 'jail-choice');
  const prisoner = await active(players);
  const before = prisoner.view!.positions[prisoner.id];
  const start = prisoner.events.length;
  await click(players, prisoner, 'jail-roll');
  const events = prisoner.events.slice(start).map(entry => entry.event);
  const dice = events.find(event => event.type === 'DiceRolled')?.payload as { dice: number[] } | undefined;
  expect(dice?.dice).toEqual([2, 2]);
  const moved = events.find(event => event.type === 'PlayerMoved')!.payload as { to: number };
  expect(events.map(event => event.type).slice(0, 3)).toEqual(['DiceRolled', 'JailReleased', 'PlayerMoved']);
  expect(moved.to).toBe((before! + dice!.dice[0]! + dice!.dice[1]!) % 40);
  expect(prisoner.view!.turn!.pendingBonus).toBe(false);
  expect(prisoner.view!.turn!.doublesStreak).toBe(0);
  for (const player of players) {
    expect(player.view!.jail[prisoner.id]).toBeUndefined();
    expect(player.view!.positions[prisoner.id]).toBe(moved.to);
    expect(player.view!.turn!.pendingBonus).toBe(false);
  }
  expectBeforeFixtureTimeout(startedAt);
});

test('S4 voluntary jail fee is debited before a normal roll', async ({ actors }) => {
  const startedAt = Date.now();
  const players = await actors(3);
  await load(players, 'jail-choice');
  const prisoner = await active(players);
  const fee = Math.floor(prisoner.view!.economy!.lapReward / 4 / 10) * 10;
  const before = prisoner.view!.balances[prisoner.id]!;
  const start = prisoner.events.length;
  await click(players, prisoner, 'jail-pay-fee');
  expect(eventSeenByAll(players, 'BalanceChanged').payload).toMatchObject({ playerId: prisoner.id, delta: -fee, reason: 'jail-fee' });
  await balances(players, { ...prisoner.view!.balances, [prisoner.id]: before - fee });
  await click(players, prisoner, 'RollDice');
  const tail = prisoner.events.slice(start).map(entry => entry.event.type);
  expect(tail.indexOf('BalanceChanged')).toBeLessThan(tail.indexOf('DiceRolled'));
  expect(tail).toContain('PlayerMoved');
  expect(eventSeenByAll(players, 'DiceRolled').payload).toMatchObject({ playerId: prisoner.id });
  expect(eventSeenByAll(players, 'PlayerMoved').payload).toMatchObject({ playerId: prisoner.id });
  for (const player of players) expect(player.view!.balances).toEqual(prisoner.view!.balances);
  const dice = prisoner.events.slice(start).find(entry => entry.event.type === 'DiceRolled')!.event.payload as { dice: number[]; double: boolean };
  expect(dice).toMatchObject({ dice: [6, 6], double: true });
  for (const player of players) {
    expect(player.view!.turn!.playerId).toBe(prisoner.id);
    expect(player.view!.turn!.pendingBonus).toBe(true);
    expect(player.view!.turn!.doublesStreak).toBe(1);
  }
  expectBeforeFixtureTimeout(startedAt);
});

test('S5 third failed jail attempt debits the forced fee before PlayerMoved', async ({ actors }) => {
  const startedAt = Date.now();
  const players = await actors(3);
  await load(players, 'jail-third-attempt');
  const prisoner = await active(players);
  const lapReward = prisoner.view!.economy!.lapReward;
  const jailFee = Math.floor(lapReward / 4 / 10) * 10;
  const before = prisoner.view!.balances[prisoner.id]!;
  const start = prisoner.events.length;
  await click(players, prisoner, 'jail-roll');
  const events = prisoner.events.slice(start).map(entry => entry.event);
  const dice = events.find(event => event.type === 'DiceRolled')?.payload as { double: boolean; dice: number[] } | undefined;
  expect(dice).toMatchObject({ double: false, dice: [1, 2] });
  const feeIndex = events.findIndex(event => event.type === 'BalanceChanged' && (event.payload as { reason?: string }).reason === 'jail-fee');
  const moveIndex = events.findIndex(event => event.type === 'PlayerMoved');
  expect(feeIndex).toBeGreaterThanOrEqual(0);
  expect(feeIndex).toBeLessThan(moveIndex);
  expect(events[feeIndex]!.payload).toMatchObject({ playerId: prisoner.id, delta: -jailFee, reason: 'jail-fee' });
  expect(events.find(event => event.type === 'JailReleased')!.payload).toMatchObject({ reason: 'fee-forced' });
  const rolledDice = events.find(event => event.type === 'DiceRolled')!.payload as { dice: number[] };
  const moved = events[moveIndex]!.payload as { playerId: string; from: number; to: number; steps: number };
  const steps = rolledDice.dice[0]! + rolledDice.dice[1]!;
  const destination = (10 + steps) % 40;
  expect(jailFee).toBe(660);
  expect(moved).toEqual({ playerId: prisoner.id, from: 10, to: destination, steps });
  const release = eventSeenByAll(players, 'JailReleased');
  expect(release.payload).toMatchObject({ playerId: prisoner.id, reason: 'fee-forced' });
  for (const player of players) {
    const eventTypes = player.events.slice(start).map(entry => entry.event.type);
    const playerFeeIndex = player.events.slice(start).findIndex(entry => entry.event.type === 'BalanceChanged'
      && (entry.event.payload as { reason?: string }).reason === 'jail-fee');
    const playerMoveIndex = player.events.slice(start).findIndex(entry => entry.event.type === 'PlayerMoved');
    expect(playerFeeIndex, `player ${player.id} received the forced jail-fee event`).toBeGreaterThanOrEqual(0);
    expect(playerMoveIndex, `player ${player.id} received the PlayerMoved event`).toBeGreaterThanOrEqual(0);
    expect(playerFeeIndex).toBeLessThan(playerMoveIndex);
    expect(eventTypes.indexOf('BalanceChanged')).toBeLessThan(eventTypes.indexOf('PlayerMoved'));
    expect(player.view!.jail[prisoner.id]).toBeUndefined();
    expect(player.view!.positions[prisoner.id]).toBe(destination);
    expect(player.view!.balances[prisoner.id]).toBe(before - jailFee);
  }
  expect(prisoner.view!.jail[prisoner.id]).toBeUndefined();
  expectBeforeFixtureTimeout(startedAt);
});

test('S6 mortgage locks redeem this turn, then allows redeem in the bonus turn', async ({ actors }) => {
  const players = await actors(3);
  await load(players, 'own-asset');
  const owner = await active(players);
  const asset = owner.view!.board!.cells.find(cell => cell.asset)!;
  await card(owner, asset.index);
  await click(players, owner, 'mortgage');
  expect(eventSeenByAll(players, 'AssetMortgaged').payload).toMatchObject({ playerId: owner.id, auto: false });
  await expect(owner.page.locator(sel('redeem'))).toBeDisabled();
  await expect(owner.page.locator(sel('redeem-reason'))).toHaveText('Выкуп доступен со следующего хода');

  // This named state is after a double: close it through the UI to produce
  // the real bonus TurnStarted transition and fresh turn id.
  await load(players, 'redeem-bonus');
  const bonusOwner = await active(players);
  const assetId = Object.keys(bonusOwner.view!.mortgages)[0]!;
  const bonusAsset = bonusOwner.view!.board!.cells.find(cell => cell.asset?.assetId === assetId)!;
  const mortgageTurnId = bonusOwner.view!.turn!.turnId;
  await card(bonusOwner, bonusAsset.index);
  await expect(bonusOwner.page.locator(sel('redeem'))).toBeDisabled();
  await expect(bonusOwner.page.locator(sel('redeem-reason'))).toHaveText('Выкуп доступен со следующего хода');
  await close(bonusOwner);
  await click(players, bonusOwner, 'EndTurn');
  const started = eventSeenByAll(players, 'TurnStarted').payload as { playerId: string; turnId: string; bonus: boolean };
  expect(started).toMatchObject({ playerId: bonusOwner.id, bonus: true });
  expect(started.turnId).not.toBe(mortgageTurnId);
  await card(bonusOwner, bonusAsset.index);
  await expect(bonusOwner.page.locator(sel('redeem'))).toBeEnabled();
  await click(players, bonusOwner, 'redeem');
  expect(eventSeenByAll(players, 'AssetRedeemed').payload).toMatchObject({ playerId: bonusOwner.id, assetId });
});

test('S7 restart restores jail attempts and mortgage lock, then accepts the prisoner action', async ({ actors }) => {
  const players = await actors(3);
  await load(players, 'stage6-restart');
  const prisoner = await active(players);
  const expectedAttempts = prisoner.view!.jail[prisoner.id];
  const expectedMortgages = structuredClone(prisoner.view!.mortgages);
  await expect(prisoner.page.locator(sel('jail-attempt-status'))).toContainText('попытка 2 из 3');
  await captureScreens(prisoner.page, 'jail-attempt-status');
  await captureScreens(prisoner.page, 'jail-choice');
  const restart = process.env['E2E_FIXTURE_RESTART_COMMAND'];
  if (!restart) throw new Error('E2E_FIXTURE_RESTART_COMMAND is required');
  const { execFileSync } = await import('node:child_process');
  const welcomes = players.map(player => player.welcomes.length);
  execFileSync('bash', ['-lc', restart], { stdio: 'pipe' });
  for (const [index, player] of players.entries()) {
    await expect.poll(() => player.welcomes.length, fast).toBeGreaterThan(welcomes[index]!);
    expect(player.view!.jail[prisoner.id]).toEqual(expectedAttempts);
    expect(player.view!.mortgages).toEqual(expectedMortgages);
    await expect(player.page.locator(sel('jail-attempt-status'))).toContainText('попытка 2 из 3');
  }
  await expect(prisoner.page.locator(sel('jail-attempt-status'))).toContainText('попытка 2 из 3');
  const assetId = Object.keys(expectedMortgages)[0]!;
  const cell = prisoner.view!.board!.cells.find(candidate => candidate.asset?.assetId === assetId)!;
  await card(prisoner, cell.index);
  await expect(prisoner.page.locator(sel('redeem'))).toBeDisabled();
  await expect(prisoner.page.locator(sel('redeem-reason'))).toHaveText('Выкуп доступен со следующего хода');
  await close(prisoner);
  await click(players, prisoner, 'jail-roll');
  const dice = eventSeenByAll(players, 'DiceRolled').payload as { playerId: string; double: boolean };
  expect(dice.playerId).toBe(prisoner.id);
  if (dice.double) {
    expect(eventSeenByAll(players, 'JailReleased').payload).toMatchObject({ playerId: prisoner.id, reason: 'double' });
    expect(prisoner.view!.turn!.pendingBonus).toBe(false);
  } else {
    expect(eventSeenByAll(players, 'JailAttemptFailed').payload).toMatchObject({ playerId: prisoner.id, attemptsUsed: 2 });
  }
});
