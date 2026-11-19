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

  const page = host.page;
  const assertNoDesktopPageScroll = async (target: import('./helpers').Actor['page']) => {
    if ((target.viewportSize()?.width ?? 0) < 1024) return;
    await expect.poll(() => target.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
  };
  const assertActionInViewport = async (target: import('./helpers').Actor['page'], id: 'buy' | 'start-auction' | 'bid' | 'pass') => {
    const actionButton = target.locator(sel(id));
    await expect(actionButton).toBeVisible();
    const box = await actionButton.boundingBox();
    expect(box).not.toBeNull();
    const height = await target.evaluate(() => window.innerHeight);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(height);
  };
  const resolvePrompts = async () => {
    while (host.view!.purchase || host.view!.auction) {
      if (host.view!.purchase) {
        const decider = players.find(p => p.id === host.view!.purchase!.playerId)!;
        await assertNoDesktopPageScroll(decider.page);
        const buy = decider.page.locator(sel('buy'));
        if ((decider.page.viewportSize()?.width ?? 0) >= 1024) await assertActionInViewport(decider.page, 'buy');
        await action(decider, await buy.isEnabled() ? 'buy' : 'start-auction');
        await syncToActor(players, decider);
      } else {
        const responder = players.find(p => p.id === host.view!.auction!.responder)!;
        await assertNoDesktopPageScroll(responder.page);
        if ((responder.page.viewportSize()?.width ?? 0) >= 1024) await assertActionInViewport(responder.page, 'bid');
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
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
      const boardBox = await page.locator(sel('board')).boundingBox();
      expect(boardBox).not.toBeNull();
      expect(boardBox!.y + boardBox!.height).toBeLessThanOrEqual(height);
    }
  }

  await Promise.all(players.map(p => p.page.setViewportSize({ width: 1440, height: 900 })));
  let purchaseDecider: import('./helpers').Actor | null = null;
  for (let i = 0; i < 120 && purchaseDecider === null; i++) {
    await resolvePrompts();
    if (host.view!.purchase) {
      purchaseDecider = players.find(p => p.id === host.view!.purchase!.playerId)!;
      break;
    }
    if (host.view!.rent) {
      const payer = players.find(p => p.id === host.view!.rent!.payerId)!;
      await action(payer, 'pay-rent');
      await syncToActor(players, payer);
      continue;
    }
    const turn = host.view!.turn;
    expect(turn, 'playing view has a current turn').not.toBeNull();
    const actor = players.find(p => p.id === turn!.playerId)!;
    await action(actor, turn!.rolled ? 'EndTurn' : 'RollDice');
    await syncToActor(players, actor);
  }
  expect(purchaseDecider, 'reach a purchase decision for the viewport check').not.toBeNull();
  await assertNoDesktopPageScroll(purchaseDecider!.page);
  await assertActionInViewport(purchaseDecider!.page, 'buy');
  await assertActionInViewport(purchaseDecider!.page, 'start-auction');
  await action(purchaseDecider!, 'start-auction');
  await syncToActor(players, purchaseDecider!);
  const responder = players.find(p => p.id === host.view!.auction!.responder)!;
  await assertNoDesktopPageScroll(responder.page);
  await assertActionInViewport(responder.page, 'bid');
  await assertActionInViewport(responder.page, 'pass');
  await action(responder, 'pass');
  await syncToActor(players, responder);

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

async function syncToActor(players: import('./helpers').Actor[], actor: import('./helpers').Actor) {
  const revision = actor.view!.revision;
  for (const player of players) await expect.poll(() => player.view?.revision).toBe(revision);
}
