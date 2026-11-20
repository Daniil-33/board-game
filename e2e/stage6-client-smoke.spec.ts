import type { StateView, GameEvent } from '../packages/game-core/src/index';
import { test, expect, sel, active, type Actor } from './helpers';
import { click, load, shoot, card } from './fixture-helpers';

test.beforeEach(() => test.skip(process.env['E2E_FIXTURES'] !== '1', 'Requires isolated fixture stack'));

function same(players: Actor[], type: string): GameEvent {
  const event = players[0]!.events.findLast(entry => entry.event.type === type)?.event;
  expect(event, `${type} reached every client`).toBeDefined();
  for (const player of players) expect(player.events.findLast(entry => entry.event.type === type)?.event).toEqual(event);
  return event!;
}

async function desktopFits(players: Actor[]) {
  for (const player of players) {
    const original = player.page.viewportSize() ?? { width: 1440, height: 900 };
    for (const viewport of [{ width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
      await player.page.setViewportSize(viewport);
      const sizes = await player.page.evaluate(() => ({ height: document.documentElement.scrollHeight, viewport: window.innerHeight }));
      expect(sizes.height, `${viewport.width}x${viewport.height} has no page scroll`).toBeLessThanOrEqual(sizes.viewport + 1);
    }
    await player.page.setViewportSize(original);
  }
}

async function assertMobileSheet(player: Actor, testId: string, portal = false) {
  const original = player.page.viewportSize() ?? { width: 1280, height: 720 };
  await player.page.setViewportSize({ width: 390, height: 844 });
  if (portal) {
    const sheet = player.page.locator('.ds-dialog.ds-responsive').last();
    await expect.poll(() => sheet.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return Math.abs(rect.bottom - window.innerHeight) < 2 && rect.width >= 389;
    })).toBe(true);
  } else {
    await expect.poll(() => player.page.locator(sel(testId)).evaluate(element => {
      const rect = element.closest('.game-dialogs')!.getBoundingClientRect();
      return getComputedStyle(element.closest('.game-dialogs')!).position === 'fixed' && rect.bottom < window.innerHeight && rect.width >= 389;
    })).toBe(true);
  }
  await player.page.setViewportSize(original);
}

test('stage 6 client: jail choice, fee payment, then normal roll', async ({ actors }, info) => {
  const players = await actors(3);
  await load(players, 'jail-choice');
  const prisoner = await active(players);
  expect(prisoner.view!.jail[prisoner.id]).toEqual({ attemptsUsed: 1 });
  await expect(prisoner.page.locator(sel('jail-choice'))).toBeVisible();
  for (const player of players.filter(item => item !== prisoner)) {
    await expect(player.page.locator(sel('jail-attempt-status'))).toContainText('В тюрьме');
  }
  await desktopFits(players);
  await assertMobileSheet(prisoner, 'jail-choice');
  await shoot(players, info, 's6-jail-choice');
  await click(players, prisoner, 'jail-pay-fee');
  expect(same(players, 'JailReleased').payload).toMatchObject({ playerId: prisoner.id, reason: 'fee' });
  expect(prisoner.view!.jail[prisoner.id]).toBeUndefined();
  await click(players, prisoner, 'RollDice');
  expect(same(players, 'DiceRolled').payload).toMatchObject({ playerId: prisoner.id });
  await shoot(players, info, 's6-jail-fee-normal-roll');
});

test('stage 6 client: casino bet and decline', async ({ actors }, info) => {
  const players = await actors(3);
  await load(players, 'casino-decision');
  const player = await active(players);
  await expect(player.page.locator(sel('casino-panel'))).toBeVisible();
  for (const observer of players.filter(item => item !== player)) await expect(observer.page.locator(sel('casino-status'))).toContainText('в казино');
  await desktopFits(players);
  await assertMobileSheet(player, 'casino-panel', true);
  await shoot(players, info, 's6-casino-bet');
  await click(players, player, 'casino-bet');
  expect(same(players, 'CasinoResolved').payload).toMatchObject({ playerId: player.id, amount: 10 });
  await expect(player.page.locator(sel('special-event-reveal'))).toContainText('Выигрыш');
  await shoot(players, info, 's6-casino-result');

  await load(players, 'casino-decision');
  const decliner = await active(players);
  await click(players, decliner, 'casino-decline');
  expect(same(players, 'CasinoDeclined').payload).toMatchObject({ playerId: decliner.id, auto: false });
  await shoot(players, info, 's6-casino-decline');
});

test('stage 6 client: chance loss opens a bank charge that can be paid', async ({ actors }, info) => {
  const players = await actors(3);
  let player: Actor | undefined;
  let drawn: GameEvent | undefined;
  for (let attempt = 0; attempt < 40; attempt++) {
    await load(players, 'pre-roll-chance');
    player = await active(players);
    await click(players, player, 'RollDice');
    drawn = player.events.findLast(entry => entry.event.type === 'ChanceDrawn')?.event;
    if (drawn && (drawn.payload as { card: string }).card.startsWith('loss-')) break;
    drawn = undefined;
  }
  expect(drawn, 'a real roll landed on a loss card within 40 fixtures').toBeDefined();
  expect((drawn!.payload as { card: string }).card).toMatch(/^loss-/);
  const chancePlayer = player!;
  expect(chancePlayer.view!.charge?.payerId).toBe(chancePlayer.id);
  await expect(chancePlayer.page.locator(sel('special-event-reveal'))).toBeVisible();
  await expect(chancePlayer.page.locator(sel('special-event-reveal'))).toContainText('капитала');
  await expect(chancePlayer.page.locator(sel('bank-charge'))).toBeVisible();
  for (const observer of players.filter(item => item !== chancePlayer)) await expect(observer.page.locator(sel('charge-status'))).toBeVisible();
  await desktopFits(players);
  await assertMobileSheet(chancePlayer, 'bank-charge');
  await shoot(players, info, 's6-chance-loss-charge');
  await click(players, chancePlayer, 'pay-charge');
  expect(same(players, 'ChargePaid').payload).toMatchObject({ payerId: chancePlayer.id, auto: false });
  expect(chancePlayer.view!.charge).toBeNull();
});

test('stage 6 client: redeem lock has its disabled reason', async ({ actors }, info) => {
  const players = await actors(3);
  await load(players, 'redeem-locked');
  const player = await active(players);
  const view = player.view as StateView;
  const assetId = Object.keys(view.mortgages)[0]!;
  const cell = view.board!.cells.find(candidate => candidate.asset?.assetId === assetId)!;
  await card(player, cell.index);
  await expect(player.page.locator(sel('redeem'))).toBeDisabled();
  await expect(player.page.locator(sel('redeem-reason'))).toHaveText('Выкуп доступен со следующего хода');
  await desktopFits(players);
  await player.page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => player.page.locator('.ds-dialog.ds-responsive').last().evaluate(element => {
    const rect = element.getBoundingClientRect();
    return Math.abs(rect.bottom - window.innerHeight) < 2 && rect.width >= 389;
  })).toBe(true);
  await player.page.setViewportSize({ width: 1280, height: 720 });
  await shoot(players, info, 's6-redeem-locked');
});
