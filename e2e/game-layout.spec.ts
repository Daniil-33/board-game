import { test, expect, createRoom, join, sel, setup, start, action } from './helpers';

test('game layout stays within all supported widths and preserves mobile selection', async ({ actors }) => {
  test.setTimeout(300_000);
  test.skip(process.env.E2E_FIXTURES === '1', 'Uses the standard room setup');
  const players = await actors(3);
  const host = players[0]!;
  const room = await createRoom(host);
  for (const guest of players.slice(1)) await join(guest, room);
  await start(players);
  await setup(players);

  const turnOwner = players.find(player => player.id === host.view?.turn?.playerId)!;
  const inactiveViewer = players.find(player => player !== turnOwner)!;
  await inactiveViewer.page.setViewportSize({ width: 390, height: 844 });
  await expect(inactiveViewer.page.locator(sel('turn-action-reason'))).toHaveText(`Сейчас ходит Player ${players.indexOf(turnOwner) + 1}.`);
  await expect(inactiveViewer.page.locator('.actions .ds-disabled-reason:visible')).toHaveCount(0);

  const page = host.page;
  const assertNoDesktopPageScroll = async (target: import('./helpers').Actor['page']) => {
    const viewport = target.viewportSize();
    if (viewport?.width !== 1440 && viewport?.width !== 1920) return;
    await expect.poll(() => target.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
  };
  const resolvePrompts = async () => {
    while (host.view!.purchase || host.view!.auction) {
      if (host.view!.purchase) {
        const decider = players.find(p => p.id === host.view!.purchase!.playerId)!;
        await assertNoDesktopPageScroll(decider.page);
        const buy = decider.page.locator(sel('buy'));
        await action(decider, await buy.isEnabled() ? 'buy' : 'start-auction');
        await syncToActor(players, decider);
      } else {
        const responder = players.find(p => p.id === host.view!.auction!.responder)!;
        await assertNoDesktopPageScroll(responder.page);
        await action(responder, 'pass');
        await syncToActor(players, responder);
      }
    }
  };
  const nav = page.locator(sel('game-tab-board'));
  for (const [width, height] of [[360, 900], [390, 900], [768, 900], [1024, 900], [1440, 900], [1920, 1080]] as const) {
    await resolvePrompts();
    await page.setViewportSize({ width, height });
    const assertNoOverflow = async () => {
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    };
    if (width < 1024) {
      await expect(nav).toBeVisible();
      for (const tab of ['board', 'assets', 'journal', 'more']) {
        await resolvePrompts();
        await page.locator(sel(`game-tab-${tab}`)).click();
        await expect(page.locator(`#game-panel-${tab}`)).toBeVisible();
        await assertNoOverflow();
      }
    } else {
      await expect(nav).toBeHidden();
      for (const id of ['player-balance', 'turn-header', 'board', 'my-turn', 'my-assets', 'event-feed']) {
        await expect(page.locator(sel(id)).first()).toBeVisible();
      }
      await assertNoOverflow();
      if (width === 1440 || width === 1920) {
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
      }
      const boardBox = await page.locator(sel('board')).boundingBox();
      expect(boardBox).not.toBeNull();
      expect(boardBox!.y + boardBox!.height).toBeLessThanOrEqual(height);
    }
  }

  await resolvePrompts();
  await page.setViewportSize({ width: 390, height: 844 });
  const journal = page.locator(sel('game-tab-journal'));
  await journal.click();
  const input = page.locator(sel('chat-input'));
  await input.fill('Mobile chat');
  await page.locator(sel('chat-send')).click();
  await expect(page.locator(sel('journal-entry')).filter({ hasText: 'Mobile chat' })).toBeVisible();
  await expect(journal).toHaveAttribute('aria-selected', 'true');

  await resolvePrompts();
  await page.locator(sel('game-tab-more')).click();
  const leave = page.locator(sel('game-leave'));
  await expect(leave).toBeDisabled();
  await page.locator(sel('Resign')).click();
  await action(host, 'confirm-resign');
  await expect.poll(() => players[1]!.view?.eliminated).toContain(host.id);
  await expect(leave).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);
  await leave.click();
  await expect(page.locator(sel('screen-lobby'))).toBeVisible();
});

test('purchase observers keep the board in the viewport at desktop sizes', async ({ actors }) => {
  test.setTimeout(300_000);
  test.skip(process.env.E2E_FIXTURES === '1', 'Uses the standard room setup');
  const players = await actors(3);
  const host = players[0]!;
  const room = await createRoom(host);
  for (const guest of players.slice(1)) await join(guest, room);
  await start(players);
  await setup(players);
  const purchase = () => host.view?.purchase ?? null;
  const auction = () => host.view?.auction ?? null;
  const rent = () => host.view?.rent ?? null;

  const resolveInterruptions = async () => {
    while (purchase() || auction() || rent()) {
      if (purchase()) {
        const buyer = players.find(player => player.id === purchase()!.playerId)!;
        await action(buyer, 'start-auction');
        await syncToActor(players, buyer);
      } else if (auction()) {
        const responder = players.find(player => player.id === auction()!.responder)!;
        await action(responder, 'pass');
        await syncToActor(players, responder);
      } else {
        const payer = players.find(player => player.id === rent()!.payerId)!;
        await action(payer, 'pay-rent');
        await syncToActor(players, payer);
      }
    }
  };

  for (let roll = 0; roll < 40; roll++) {
    await resolveInterruptions();
    if (purchase()) break;
    const roller = players.find(player => player.id === host.view!.turn?.playerId)!;
    await action(roller, 'RollDice');
    await syncToActor(players, roller);
    if (purchase()) {
      const buyerId = purchase()!.playerId;
      const observer = players.find(player => player.id !== buyerId)!;
      for (const [width, height] of [[1440, 900], [1920, 1080]] as const) {
        await observer.page.setViewportSize({ width, height });
        await expect(observer.page.locator(sel('purchase-status'))).toBeVisible();
        await expect.poll(() => observer.page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
        const board = await observer.page.locator(sel('board')).boundingBox();
        expect(board, `observer board at ${width}x${height}`).not.toBeNull();
        expect(board!.y + board!.height, `observer board bottom at ${width}x${height}`).toBeLessThanOrEqual(height);
      }
      return;
    }
    await resolveInterruptions();
    if (roller.view!.turn?.playerId === roller.id && roller.view!.turn.rolled) await action(roller, 'EndTurn');
  }
  throw new Error('No purchase decision reached after 40 rolls');
});

async function syncToActor(players: import('./helpers').Actor[], actor: import('./helpers').Actor) {
  const revision = actor.view!.revision;
  for (const player of players) await expect.poll(() => player.view?.revision).toBe(revision);
}
