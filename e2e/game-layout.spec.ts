import { test, expect, captureScreens, createRoom, join, sel, setup, start, action, active, assertJournalEntryBelowHeading } from './helpers';
import { load, click } from './fixture-helpers';

test('final evidence lobby lists rooms created by other actors', async ({ actors }) => {
  test.skip(process.env.E2E_SCREEN_EVIDENCE !== '1', 'Evidence-only populated lobby capture');
  test.skip(process.env.E2E_FIXTURES === '1', 'Uses the standard room stack');
  const [openHost, playingHost, playingGuest, viewer] = await actors(4);
  const openRoom = await createRoom(openHost!);
  const playingRoom = await createRoom(playingHost!);
  await join(playingGuest!, playingRoom);
  await start([playingHost!, playingGuest!]);

  await viewer!.page.locator(sel('refresh')).click();
  const openRow = viewer!.page.locator(`${sel('room')}[data-room-id="${openRoom}"]`);
  const playingRow = viewer!.page.locator(`${sel('room')}[data-room-id="${playingRoom}"]`);
  await expect(openRow).toBeVisible();
  await expect(openRow.locator(sel('room-status'))).toHaveText('Открытая');
  await expect(openRow.locator('strong')).toHaveText('Комната Player 1');
  await expect(playingRow).toBeVisible();
  await expect(playingRow.locator(sel('room-status'))).toHaveText('Идёт партия');
  await expect(playingRow.locator('strong')).toHaveText('Комната Player 2');
  for (const row of [openRow, playingRow]) await expect(row.locator('strong')).not.toContainText(/r_[A-Za-z0-9_-]+/);
  await captureScreens(viewer!.page, 'lobby');
});

test('game layout stays within all supported widths and preserves mobile selection', async ({ actors }) => {
  test.setTimeout(300_000);
  test.skip(process.env.E2E_FIXTURES === '1', 'Uses the standard room setup');
  const players = await actors(3);
  const host = players[0]!;
  const room = await createRoom(host);
  for (const guest of players.slice(1)) await join(guest, room);
  await start(players);
  await captureScreens(host.page, 'turn-order');
  await setup(players);
  await captureScreens(host.page, 'game');
  await captureScreens(host.page, 'board');

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

test('desktop journal keeps a long RATE_LIMITED rejection reachable', async ({ actors }) => {
  test.setTimeout(120_000);
  test.skip(process.env.E2E_FIXTURES === '1', 'Uses the standard room setup');
  const players = await actors(2);
  const host = players[0]!;
  const room = await createRoom(host);
  await join(players[1]!, room);
  await start(players);
  await setup(players);

  const page = host.page;
  await page.setViewportSize({ width: 1440, height: 900 });
  const rejectedText = 'я'.repeat(300);
  const initialAckCount = host.chatAcks.length;
  for (let i = 0; i < 6; i++) {
    if (i > 0) await page.waitForTimeout(550);
    await page.locator(sel('chat-input')).fill(i === 5 ? rejectedText : `limit message ${i + 1}`);
    await page.locator(sel('chat-send')).click();
    await expect.poll(() => host.chatAcks.length).toBe(initialAckCount + i + 1);
  }

  const rejection = page.locator(`${sel('chat-rejection')}[data-reason="RATE_LIMITED"]`);
  await expect(rejection).toHaveCount(1);
  await expect(rejection).toContainText('Достигнут лимит отправки сообщений. Попробуйте позже.');
  await captureScreens(page, 'chat-rejection', ['desktop']);

  for (const [width, height] of [[1440, 900], [1920, 1080]] as const) {
    await page.setViewportSize({ width, height });
    await expect.poll(() => rejection.evaluate((element, text) => element.textContent?.includes(text) ?? false, rejectedText)).toBe(true);
    await expect.poll(() => rejection.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
    await assertJournalEntryBelowHeading(page);

    const box = await rejection.boundingBox();
    expect(box, 'bounded rejection box').not.toBeNull();
    await rejection.evaluate(element => { element.scrollTop = 0; });
    const reason = rejection.locator('p').first();
    await expect(reason).toBeVisible();
    const reasonBox = await reason.boundingBox();
    expect(reasonBox).not.toBeNull();
    expect(reasonBox!.y).toBeGreaterThanOrEqual(box!.y);
    expect(reasonBox!.y + reasonBox!.height).toBeLessThanOrEqual(box!.y + box!.height + 1);

    await rejection.evaluate(element => { element.scrollTop = element.scrollHeight; });
    const dismiss = rejection.getByRole('button', { name: 'Закрыть' });
    await expect(dismiss).toBeVisible();
    const dismissBox = await dismiss.boundingBox();
    expect(dismissBox).not.toBeNull();
    expect(dismissBox!.y).toBeGreaterThanOrEqual(box!.y);
    expect(dismissBox!.y + dismissBox!.height).toBeLessThanOrEqual(box!.y + box!.height + 1);
    await assertJournalEntryBelowHeading(page);
  }

  await rejection.getByRole('button', { name: 'Закрыть' }).click();
  await expect(rejection).toHaveCount(0);
});

test('desktop journal stacks and dismisses two RATE_LIMITED rejections without overlap', async ({ actors }) => {
  test.setTimeout(120_000);
  test.skip(process.env.E2E_FIXTURES === '1', 'Uses the standard room setup');
  const players = await actors(2);
  const host = players[0]!;
  const room = await createRoom(host);
  await join(players[1]!, room);
  await start(players);
  await setup(players);

  const page = host.page;
  const rejectedTexts = ['я'.repeat(300), 'б'.repeat(300)] as const;
  const sendTwoRateLimited = async () => {
    const initialAckCount = host.chatAcks.length;
    for (let i = 0; i < 5; i++) {
      if (i > 0) await page.waitForTimeout(550);
      await page.locator(sel('chat-input')).fill(`two-rejection seed ${i + 1}`);
      await page.locator(sel('chat-send')).click();
      await expect.poll(() => host.chatAcks.length).toBe(initialAckCount + i + 1);
      expect(host.chatAcks.at(-1)?.ok).toBe(true);
    }
    for (let i = 0; i < 2; i++) {
      await page.waitForTimeout(550);
      await page.locator(sel('chat-input')).fill(rejectedTexts[i]!);
      await page.locator(sel('chat-send')).click();
      await expect.poll(() => host.chatAcks.length).toBe(initialAckCount + 6 + i);
      expect(host.chatAcks.at(-1)).toMatchObject({ ok: false, reason: 'RATE_LIMITED' });
    }
  };
  const assertNoOverlap = async () => {
    const boxes = await page.locator(sel('chat-rejection')).evaluateAll(elements => elements.map(element => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
    }));
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!;
      const b = boxes[j]!;
      expect(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top,
        `visible rejection boxes overlap: ${JSON.stringify({ a, b })}`).toBe(true);
    }
  };
  const assertDismissHitTest = async (rejectionIndex: number) => {
    const wrapper = page.locator('.chat-rejections');
    const rejection = page.locator(sel('chat-rejection')).nth(rejectionIndex);
    const reason = rejection.locator('p').first();
    await wrapper.evaluate((element, index) => {
      const target = element.children[index] as HTMLElement;
      const wrapperBox = element.getBoundingClientRect();
      element.scrollTop += target.getBoundingClientRect().top - wrapperBox.top;
    }, rejectionIndex);
    await expect(reason).toContainText('Достигнут лимит отправки сообщений. Попробуйте позже.');
    await expect.poll(() => reason.evaluate(element => {
      const wrapperBox = element.closest('.chat-rejections')!.getBoundingClientRect();
      const box = element.getBoundingClientRect();
      return box.top >= wrapperBox.top && box.bottom <= wrapperBox.bottom;
    })).toBe(true);

    const dismiss = rejection.getByRole('button', { name: 'Закрыть' });
    await wrapper.evaluate((element, index) => {
      const target = element.children[index] as HTMLElement;
      const button = target.querySelector('button')!;
      element.scrollTop += button.getBoundingClientRect().bottom - element.getBoundingClientRect().bottom;
    }, rejectionIndex);
    const hit = await dismiss.evaluate(element => {
      const rect = element.getBoundingClientRect();
      const target = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return { hit: Boolean(target && (target === element || element.contains(target))), box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } };
    });
    expect(hit.hit, `dismiss is hit-testable at ${JSON.stringify(hit.box)}`).toBe(true);
    await dismiss.click();
  };

  for (const [width, height] of [[1440, 900], [1920, 1080]] as const) {
    if (width === 1920) {
      await page.waitForTimeout(10_200);
      await sendTwoRateLimited();
    } else {
      await sendTwoRateLimited();
    }
    await page.setViewportSize({ width, height });
    const rejections = page.locator(sel('chat-rejection'));
    await expect(rejections).toHaveCount(2);
    for (const [index, rejection] of (await rejections.all()).entries()) {
      await expect(rejection).toHaveAttribute('data-reason', 'RATE_LIMITED');
      await expect(rejection.locator('p').first()).toContainText('Достигнут лимит отправки сообщений. Попробуйте позже.');
      await expect(rejection.locator('p').nth(1)).toHaveText(rejectedTexts[index]!);
    }
    if (width === 1440) {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator(sel('game-tab-journal')).click();
      const mobileWrapper = page.locator('.chat-rejections');
      if (await mobileWrapper.count()) {
        await expect(mobileWrapper).toHaveCSS('max-height', 'none');
        await expect(mobileWrapper).toHaveCSS('overflow-y', 'visible');
        await expect(mobileWrapper).toHaveCSS('grid-row-start', 'auto');
      }
      await assertNoOverlap();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await captureScreens(page, 'chat-rejection-two-mobile', ['mobile']);
      await page.setViewportSize({ width, height });
    }
    await expect.poll(() => page.locator('.chat-rejections').evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
    await assertNoOverlap();
    await assertJournalEntryBelowHeading(page);
    if (width === 1440) {
      await captureScreens(page, 'chat-rejection-two', ['desktop']);
      await page.locator('.chat-rejections').evaluate(element => {
        const second = element.children[1]!;
        element.scrollTop += second.getBoundingClientRect().top - element.getBoundingClientRect().top;
      });
      await captureScreens(page, 'chat-rejection-two-scrolled', ['desktop']);
    }

    await assertDismissHitTest(0);
    await expect(rejections).toHaveCount(1);
    await assertNoOverlap();
    await assertJournalEntryBelowHeading(page);
    await assertDismissHitTest(0);
    await expect(rejections).toHaveCount(0);
    await assertJournalEntryBelowHeading(page);
    const rowCount = await page.locator('.event-feed').evaluate(element => getComputedStyle(element).gridTemplateRows.split(' ').length);
    expect(rowCount, 'dismissal restores the two-row journal grid').toBe(2);
  }
});

test('desktop rent and debt overlays preserve the board and top bar', async ({ actors }) => {
  test.skip(process.env.E2E_FIXTURES !== '1', 'Uses isolated server fixtures');
  const players = await actors(2);
  await load(players, 'shortfall');
  const payer = players.find(player => player.id === player.view?.rent?.payerId)!;
  await payer.page.locator(sel('chat-input')).fill('Rent fixture journal check');
  await payer.page.locator(sel('chat-composer')).evaluate(form => (form as HTMLFormElement).requestSubmit());
  await expect(payer.page.locator(sel('journal-entry')).filter({ hasText: 'Rent fixture journal check' })).toBeVisible();
  for (const [width, height] of [[1440, 900], [1920, 1080]] as const) {
    await payer.page.setViewportSize({ width, height });
    await assertJournalEntryBelowHeading(payer.page);
    await expect(payer.page.locator(sel('rent'))).toBeVisible();
    await expect(payer.page.locator(sel('rent-line'))).toContainText(`Player ${players.indexOf(payer) + 1}`);
    await expect(payer.page.locator(sel('rent-line'))).toContainText(`Player ${players.indexOf(players.find(p => p.id === payer.view!.rent!.ownerId)!) + 1}`);
    await expect(payer.page.locator(sel('rent'))).toBeInViewport();
    await expect(payer.page.locator(sel('game-top-bar'))).toBeInViewport();
    await expect.poll(() => payer.page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    const board = await payer.page.locator(sel('board')).boundingBox();
    expect(board).not.toBeNull();
    expect(board!.y + board!.height).toBeLessThanOrEqual(height);
  }
  await load(players, 'liquidation-multi-tier');
  const debtor = players.find(player => player.id === player.view?.rent?.payerId)!;
  await click(players, debtor, 'pay-rent');
  await expect(debtor.page.locator(sel('debt-notices'))).toBeVisible();
  const currentNotice = debtor.page.locator(sel('current-debt-notice'));
  await expect(currentNotice).toBeVisible();
  for (const [width, height] of [[1440, 900], [1920, 1080]] as const) {
    await debtor.page.setViewportSize({ width, height });
    await assertJournalEntryBelowHeading(debtor.page);
    await expect(currentNotice.locator(sel('liquidation'))).toBeInViewport();
    await expect(debtor.page.locator(sel('game-top-bar'))).toBeInViewport();
    await expect.poll(() => debtor.page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    const assets = debtor.page.locator('#game-panel-assets');
    await expect(assets).toHaveAttribute('tabindex', '0');
    await assets.focus();
    await expect(assets).toBeFocused();
    await expect.poll(() => assets.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
    await expect.poll(() => assets.evaluate(element => getComputedStyle(element).scrollbarWidth)).toBe('thin');
    await expect(assets).toHaveAttribute('role', 'region');
    await expect(assets).toHaveAttribute('aria-labelledby', 'game-panel-assets-heading');
    const roster = debtor.page.locator('.roster-column');
    await expect(roster).toHaveAttribute('role', 'region');
    await expect(roster).toHaveAttribute('aria-labelledby', 'game-panel-players-heading');
    await expect(roster).not.toHaveAttribute('tabindex', '0');
    const board = await debtor.page.locator(sel('board')).boundingBox();
    expect(board).not.toBeNull();
    expect(board!.y + board!.height).toBeLessThanOrEqual(height);
  }
  await currentNotice.locator(sel('debt-notice-dismiss')).click();
  await expect(currentNotice).toHaveCount(0);
  await expect(debtor.page.locator(sel('debt-notices'))).toBeVisible();

  await load(players, 'liquidation-multi-tier');
  const secondDebtor = players.find(player => player.id === player.view?.rent?.payerId)!;
  await click(players, secondDebtor, 'pay-rent');
  const secondNotice = secondDebtor.page.locator(sel('current-debt-notice'));
  await expect(secondNotice).toBeVisible();
  const turnOwner = await active(players);
  const turnId = turnOwner.view!.turn!.turnId;
  await action(turnOwner, 'EndTurn');
  await expect.poll(() => turnOwner.view?.turn?.turnId).not.toBe(turnId);
  await expect(secondNotice).toHaveCount(0);
  await expect(secondDebtor.page.locator(sel('debt-notices'))).toBeVisible();
  await secondDebtor.page.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(() => secondDebtor.page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  await captureScreens(secondDebtor.page, 'liquidation-next-turn');

  const [observer] = await actors(1);
  players.push(observer!);
  await load(players, 'bankruptcy-houses');
  const bankruptcyPayer = players.find(player => player.id === player.view?.rent?.payerId)!;
  await click(players, bankruptcyPayer, 'pay-rent');
  const bankruptcyViewer = players.find(player => player.id !== bankruptcyPayer.id)!;
  await expect(bankruptcyViewer.page.locator(sel('current-debt-notice')).locator(sel('bankruptcy'))).toBeVisible();
  await assertJournalEntryBelowHeading(bankruptcyViewer.page);
  for (const [width, height] of [[1440, 900], [1920, 1080]] as const) {
    await bankruptcyViewer.page.setViewportSize({ width, height });
    await expect(bankruptcyViewer.page.locator(sel('current-debt-notice')).locator(sel('bankruptcy'))).toBeInViewport();
    await expect(bankruptcyViewer.page.locator(sel('game-top-bar'))).toBeInViewport();
    await expect.poll(() => bankruptcyViewer.page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    const board = await bankruptcyViewer.page.locator(sel('board')).boundingBox();
    expect(board).not.toBeNull();
    expect(board!.y + board!.height).toBeLessThanOrEqual(height);
  }
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
      const buyer = players.find(player => player.id === buyerId)!;
      const observer = players.find(player => player.id !== buyerId)!;
      for (const [width, height] of [[1440, 900], [1920, 1080]] as const) {
        await buyer.page.setViewportSize({ width, height });
        await expect(buyer.page.locator(sel('buy'))).toBeInViewport();
        await expect(buyer.page.locator(sel('start-auction'))).toBeInViewport();
        await observer.page.setViewportSize({ width, height });
        const purchaseStatus = observer.page.locator(sel('purchase-status'));
        await expect(purchaseStatus).toBeVisible();
        await expect.poll(() => purchaseStatus.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(15, 21, 39)');
        await expect.poll(() => observer.page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
        const board = await observer.page.locator(sel('board')).boundingBox();
        expect(board, `observer board at ${width}x${height}`).not.toBeNull();
        expect(board!.y + board!.height, `observer board bottom at ${width}x${height}`).toBeLessThanOrEqual(height);
      }
      await captureScreens(observer.page, 'purchase-observer');
      await observer.page.setViewportSize({ width: 390, height: 844 });
      await observer.page.locator(sel('game-tab-assets')).click();
      await captureScreens(observer.page, 'assets');
      await observer.page.locator(sel('game-tab-journal')).click();
      await captureScreens(observer.page, 'journal');
      await observer.page.locator(sel('game-tab-more')).click();
      await captureScreens(observer.page, 'more');
      await observer.page.locator(sel('game-tab-board')).click();
      await captureScreens(buyer.page, 'purchase');
      await buyer.page.setViewportSize({ width: 390, height: 844 });
      await expect(buyer.page.locator(sel('buy'))).toBeInViewport();
      await expect(buyer.page.locator(sel('start-auction'))).toBeInViewport();
      await action(buyer, 'start-auction');
      await syncToActor(players, buyer);
      const auctionState = host.view!.auction!;
      const responder = players.find(player => player.id === auctionState.responder)!;
      const auctionObserver = players.find(player => player.id !== auctionState.responder)!;
      await captureScreens(responder.page, 'auction');
      await responder.page.setViewportSize({ width: 390, height: 844 });
      await expect(responder.page.locator(sel('bid'))).toBeInViewport();
      await expect(responder.page.locator(sel('pass'))).toBeInViewport();
      await captureScreens(auctionObserver.page, 'auction-observer');
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
