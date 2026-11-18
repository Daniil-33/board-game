import { money } from './ru-text';
import { AUCTION_RESPONSE_MS, CONTINUATION_MS } from '../packages/game-core/src/index';
import playwrightConfig from '../playwright.config';
import { execFileSync } from 'node:child_process';
import { cellRect } from '../apps/client/src/widgets/board/layout';
import { test, expect, sel, createRoom, join, start, setup, active, action, resign, waitGameReady } from './helpers';

test('three guests: setup, movement, reload, server restart and resignation to winner', async ({ actors }, info) => {
  test.skip(process.env['E2E_DETERMINISTIC'] === '1', 'Recovery uses production CSPRNG');
  test.setTimeout(180_000 + 4 * 3 * AUCTION_RESPONSE_MS);
  const players = await actors(3), host = players[0]!;
  const room = await createRoom(host);
  for (const p of players.slice(1)) await join(p, room);
  await start(players); await stage2(players, 19940); await setup(players);
  for (let i = 0; i < players.length; i++) {
    const path = info.outputPath(`three-client-${i}.png`);
    await players[i]!.page.screenshot({ path, fullPage: true });
    await info.attach(`three-client-${i}`, { path, contentType: 'image/png' });
  }
  for (let i = 0; i < 4; i++) {
    const actor = await active(players);
    const before = actor.view!.positions[actor.id]!;
    const turnId = actor.view!.turn!.turnId;
    await action(actor, 'RollDice');
    const rolled = actor.events.filter(e => e.event.type === 'DiceRolled').map(e => e.event)
      .findLast(e => {
        const payload = e.payload as { playerId: string; turnId: string };
        return payload.playerId === actor.id && payload.turnId === turnId;
      })!.payload as { dice: number[] };
    if (!actor.view!.jail[actor.id]) expect(actor.view!.positions[actor.id]).toBe((before + rolled.dice[0]! + rolled.dice[1]!) % 40);
    if (actor.view!.turn?.playerId === actor.id && actor.view!.turn.rolled) await endTurn(actor, players);
    await expect.poll(() => host.view?.revision).toBe(actor.view!.revision);
  }
  const current = await active(players), id = current.id, revision = current.view!.revision;
  const beforeReload = structuredClone(current.view!);
  const welcomeCount = current.welcomes.length;
  await current.page.reload();
  await waitGameReady(current);
  await expect.poll(() => current.view?.revision).toBe(revision);
  await expect.poll(() => current.welcomes.length).toBeGreaterThan(welcomeCount);
  expect(current.welcomes.at(-1)!.playerId).toBe(id);
  expect(current.view!.board).toEqual(beforeReload.board);
  expect(current.view!.balances).toEqual(beforeReload.balances);
  await panels(players);
  await expect(current.page.locator(sel('RollDice'))).toBeEnabled();
  await action(current, 'RollDice');
  await expect.poll(() => host.view?.revision).toBe(current.view!.revision);
  const saved = JSON.parse(JSON.stringify(host.view));
  const welcomesBeforeRestart = players.map(p => p.welcomes.length);
  execFileSync('bash', ['-lc', process.env['E2E_RESTART_COMMAND'] ?? "sg docker -c 'docker compose -p s1-e2e restart server'"], { stdio: 'pipe' });
  for (const p of players) {
    await expect.poll(() => p.welcomes.length).toBeGreaterThan(welcomesBeforeRestart[players.indexOf(p)]!);
    expect(p.welcomes.at(-1)!.playerId).toBe(p.id);
    await expect(p.page.locator(sel('offline'))).toHaveCount(0);
    await expect.poll(() => p.view?.revision).toBe(saved.revision);
    expect(p.view!.players).toEqual(saved.players);
    expect(p.view!.positions).toEqual(saved.positions);
    expect(p.view!.board).toEqual(saved.board);
    expect(p.view!.balances).toEqual(saved.balances);
  }
  await panels(players);
  await resolvePrompts(players);
  const resumed = await active(players);
  if (resumed.view!.turn!.rolled) await endTurn(resumed, players);
  else await action(resumed, 'RollDice');
  await resign(players[2]!); await resign(players[1]!);
  for (const p of players) {
    await expect(p.page.locator(sel('game-over-title'))).toBeVisible();
    await expect(p.page.locator(sel('game-over-title'))).toHaveRole('heading');
    await expect(p.page.locator(sel('game-over-title'))).toHaveText('Партия окончена');
    await expect(p.page.locator(sel('winner'))).toHaveText('Победитель: Player 1');
  }
});

test('locked code and invite, participant leave and creator closes room', async ({ actors }) => {
  test.skip(process.env['E2E_DETERMINISTIC'] === '1', 'Separate fresh deterministic fixture');
  const [host, guest] = await actors(2);
  const room = await createRoom(host!, 'browser-fixture-code');
  await join(guest!, room, 'browser-fixture-code');
  const invite = await host!.page.locator(sel('invite-link')).inputValue();
  const [third] = await actors(1, invite);
  await expect(third!.page.locator(sel('screen-room'))).toBeVisible();
  await expect(host!.page.locator(sel('member'))).toHaveCount(3);
  await guest!.page.locator(sel('leave')).click();
  await expect(guest!.page.locator(sel('screen-lobby'))).toBeVisible();
  await expect(host!.page.locator(sel('member'))).toHaveCount(2);
  await host!.page.locator(sel('leave')).click();
  await host!.page.locator(sel('confirm-leave')).click();
  await expect(host!.page.locator(sel('screen-lobby'))).toBeVisible();
  await expect(third!.page.locator(sel('screen-lobby'))).toBeVisible();
  await third!.page.locator(sel('refresh')).click();
  await expect(third!.page.locator(`${sel('room')}[data-room-id="${room}"]`)).toHaveCount(0);
  // Read Docker's raw runtime logs before the artifact sanitizer can redact them.
  const rawWebLogs = execFileSync('bash', ['-lc', process.env['E2E_WEB_LOGS_COMMAND']
    ?? "sg docker -c 'docker compose -p s1-e2e logs --no-color web'"], { encoding: 'utf8' });
  expect(/"GET \/(?:index\.html)? HTTP\//.test(rawWebLogs), 'raw web logs contain page requests').toBe(true);
  expect(rawWebLogs.includes('code='), 'raw web logs must omit invite query and Referer credentials').toBe(false);
});

test('AFK uses actual 45 second auto-roll and 20 second continuation', async ({ actors }) => {
  test.setTimeout(playwrightConfig.timeout! + 2 * AUCTION_RESPONSE_MS);
  test.skip(process.env['E2E_DETERMINISTIC'] === '1', 'Separate fresh deterministic fixture');
  const players = await actors(2), host = players[0]!;
  const room = await createRoom(host); await join(players[1]!, room);
  await start(players); await setup(players);
  const original = structuredClone(host.view!.turn!);
  const started = host.events.find(({ event }) => event.type === 'TurnStarted'
    && (event.payload as { turnId: string }).turnId === original.turnId)!;
  // Frame receipt is slightly later than server transition time; allow 1s transport delay.
  expect(Math.abs(original.deadline - started.at - 45_000)).toBeLessThanOrEqual(1_000);
  await expect.poll(() => host.view?.turn?.continuation, { timeout: 50_000 }).toBe(true);
  const continued = host.view!.turn!;
  expect(continued.turnId).toBe(original.turnId);
  expect(continued.quotas).toEqual(original.quotas);
  expect(continued.deadline - original.deadline).toBeGreaterThanOrEqual(20_000);
  expect(continued.deadline - original.deadline).toBeLessThan(23_000);
  const roll = host.events.find(e => e.event.type === 'DiceRolled')!;
  expect(roll.at).toBeGreaterThanOrEqual(original.deadline);
  expect(roll.event.payload).toMatchObject({ auto: true });
  await expect.poll(() => host.view?.turn?.turnId, { timeout: CONTINUATION_MS + players.length * AUCTION_RESPONSE_MS + playwrightConfig.expect!.timeout! }).not.toBe(original.turnId);
  await settledAuction(players, host.events.filter(e => e.event.type === 'AuctionStarted').at(-1)?.event.payload as import('../packages/game-core/src/index').AuctionState | undefined);
  const ended = host.events.find(e => e.event.type === 'TurnEnded')!;
  expect(ended.at).toBeGreaterThanOrEqual(continued.deadline);
  expect(ended.event.payload).toMatchObject({ reason: 'timeout' });
});

test('seed 6689: setup tie, three doubles jail before movement and interim jail attempt', async ({ actors }) => {
  test.skip(process.env['E2E_DETERMINISTIC'] !== '1', 'Requires fresh test-only seeded stack');
  test.setTimeout(240_000 + 60 * 2 * AUCTION_RESPONSE_MS);
  const players = await actors(2), host = players[0]!;
  const room = await createRoom(host); await join(players[1]!, room);
  await start(players);
  await stage2(players, 29910);
  expect(await setup(players)).toBe(4);
  const prisoner = await active(players);
  for (const dice of [[1, 1], [4, 4]]) {
    await action(prisoner, 'RollDice');
    expect(prisoner.events.filter(e => e.event.type === 'DiceRolled').at(-1)!.event.payload).toMatchObject({ dice, double: true });
    await endTurn(prisoner, players);
  }
  const balancesBeforeJail = structuredClone(prisoner.view!.balances);
  const count = prisoner.events.length;
  await action(prisoner, 'RollDice');
  const events = prisoner.events.slice(count).map(e => e.event);
  expect(events.map(e => e.type)).toEqual(['DiceRolled', 'SentToJail', 'TurnEnded', 'TurnStarted']);
  expect(prisoner.view!.balances).toEqual(balancesBeforeJail);
  for (const p of players) {
    await expect.poll(() => p.view?.balances).toEqual(balancesBeforeJail);
  }
  await panels(players);
  expect(events[0]!.payload).toMatchObject({ dice: [6, 6], double: true });
  expect(prisoner.view!.positions[prisoner.id]).toBe((events[1]!.payload as { to: number }).to);
  expect(prisoner.view!.jail[prisoner.id]).toEqual({ attemptsUsed: 0 });
  expect(prisoner.view!.turn!.doublesStreak).toBe(0);
  await expect(prisoner.page.locator(sel('jail'))).toContainText('временное правило');
  await expect.poll(() => host.view?.revision).toBe(prisoner.view!.revision);
  for (let i = 0; host.view!.turn!.playerId !== prisoner.id; i++) {
    expect(i).toBeLessThan(10);
    const other = await active(players); await action(other, 'RollDice');
    if (other.view!.turn!.rolled) await endTurn(other, players);
    await expect.poll(() => host.view?.revision).toBe(other.view!.revision);
  }
  const attemptStart = prisoner.events.length;
  const jailPosition = prisoner.view!.positions[prisoner.id];
  await action(prisoner, 'RollDice');
  const attempt = prisoner.events.slice(attemptStart).map(e => e.event);
  expect(attempt[0]!.type).toBe('DiceRolled');
  if (prisoner.view!.jail[prisoner.id]) {
    expect(prisoner.view!.jail[prisoner.id]).toEqual({ attemptsUsed: 1 });
    expect(attempt.map(e => e.type)).toEqual(['DiceRolled', 'InterimJailAttemptFailed']);
    expect(prisoner.view!.positions[prisoner.id]).toBe(jailPosition);
    await expect(prisoner.page.locator(sel('jail'))).toContainText('использовано попыток: 1');
  } else {
    expect(attempt.map(e => e.type)).toEqual(['DiceRolled', 'InterimJailReleased', 'PlayerMoved', ...(prisoner.view!.purchase ? ['PurchaseOffered'] : [])]);
    expect(attempt[1]!.payload).toMatchObject({ reason: 'double' });
  }
  expect(prisoner.view!.turn!.pendingBonus).toBe(false);
  expect(prisoner.events.at(-1)!.revision).toBe(prisoner.view!.revision);
  // Continue the fresh seed-6689/core-5 stream, after the setup tie and jail
  // attempt above, resolving any acquisitions through auction commands.
  // A forward crossing still credits exactly 3980 without a new seed or restart.
  let crossed = false;
  for (let i = 0; i < 60 && !crossed; i++) {
    await expect.poll(() => host.view?.revision).toBe(prisoner.view!.revision);
    const actor = await active(players);
    if (actor.view!.turn!.rolled) { await endTurn(actor, players); }
    else {
      const before = structuredClone(actor.view!);
      const eventCount = actor.events.length;
      await action(actor, 'RollDice');
      const events = actor.events.slice(eventCount).map(e => e.event);
      if (events.some(e => e.type === 'BalanceChanged')) {
        expect(events).toContainEqual({ type: 'BalanceChanged', payload: {
          playerId: actor.id, delta: 3980, balance: before.balances[actor.id]! + 3980, reason: 'lap-reward',
        } });
        expect(before.positions[actor.id]!).toBeGreaterThan(actor.view!.positions[actor.id]!);
        expect(actor.view!.balances[actor.id]).toBe(before.balances[actor.id]! + 3980);
        for (const p of players) await expect.poll(() => p.view?.balances).toEqual(actor.view!.balances);
        await panels(players);
        crossed = true;
      }
    }
    // Synchronize all views before choosing the next active actor.
    const revision = actor.view!.revision;
    for (const p of players) await expect.poll(() => p.view?.revision).toBe(revision);
  }
  expect(crossed, 'seed 6689 must reach a rewarded forward start crossing in 60 actions').toBe(true);
});

/** Verify auctions that time out naturally in these server-deadline scenarios. */
async function settledAuction(players: import('./helpers').Actor[], auction = players[0]!.view!.auction ?? undefined): Promise<void> {
  if (!auction) return;
  const host = players[0]!;
  const activeCount = host.view!.players.length - host.view!.eliminated.length;
  await expect.poll(() => host.events.some(e => e.event.type === 'AuctionEndedUnsold' &&
    (e.event.payload as { auctionId: string }).auctionId === auction.auctionId), {
    timeout: activeCount * AUCTION_RESPONSE_MS + playwrightConfig.expect!.timeout!,
  }).toBe(true);
  expect(host.view!.auction).toBeNull();
  const relevant = host.events.filter(e => (e.event.payload as { auctionId?: string }).auctionId === auction.auctionId);
  expect(relevant[0]!.event.type).toBe('AuctionStarted');
  const passes = relevant.filter(e => e.event.type === 'AuctionPassed');
  expect(passes).toHaveLength(activeCount);
  for (const pass of passes) expect(pass.event.payload).toMatchObject({ auto: true });
  expect(relevant.at(-1)!.event.type).toBe('AuctionEndedUnsold');
  const revision = host.view!.revision;
  for (const p of players) await expect.poll(() => p.view?.revision).toBe(revision);
}

async function endTurn(actor: import('./helpers').Actor, players: import('./helpers').Actor[]): Promise<void> {
  if (actor.view!.purchase || await actor.page.locator(sel('start-auction')).count() > 0) {
    await action(actor, 'start-auction');
    await syncToActor(players, actor);
    while (actor.view!.auction) {
      const auction = actor.view!.auction!;
      const responder = players.find(p => p.id === auction.responder)!;
      await action(responder, 'pass');
      await syncToActor(players, responder);
    }
  }
  const turnId = actor.view!.turn!.turnId;
  const beforeEnd = actor.view!.revision;
  await action(actor, 'EndTurn');
  await expect.poll(() => actor.view?.revision).toBeGreaterThan(beforeEnd);
  await syncToActor(players, actor);
  const auction = actor.view!.auction;
  await settledAuction(players, auction ?? undefined);
  if (auction) {
    expect(actor.events.some(e => e.event.type === 'TurnEnded' && (e.event.payload as { turnId: string }).turnId === turnId)).toBe(true);
  }
}

async function resolvePrompts(players: import('./helpers').Actor[]): Promise<void> {
  while (players[0]!.view!.purchase || players[0]!.view!.auction) {
    if (players[0]!.view!.purchase) {
      const purchase = players[0]!.view!.purchase!;
      const decider = players.find(p => p.id === purchase.playerId)!;
      const buy = decider.page.locator(sel('buy'));
      await action(decider, await buy.isEnabled() ? 'buy' : 'start-auction');
      await syncToActor(players, decider);
    } else {
      const responder = players.find(p => p.id === players[0]!.view!.auction!.responder)!;
      await action(responder, 'pass');
      await syncToActor(players, responder);
    }
  }
}

async function syncToActor(players: import('./helpers').Actor[], actor: import('./helpers').Actor): Promise<void> {
  const revision = actor.view!.revision;
  for (const player of players) await expect.poll(() => player.view?.revision).toBe(revision);
}

async function panels(players: import('./helpers').Actor[]): Promise<void> {
  for (const p of players) {
    for (const player of p.view!.players) {
      const name = `Player ${players.findIndex(a => a.id === player.id) + 1}`;
      const row = p.page.locator(`${sel('player-balance')}[data-player-id="${player.id}"]`);
      await expect(row.locator(sel('player-balance-name'))).toHaveText(name);
      await expect(row.locator(sel('player-balance-value'))).toHaveText(money(p.view!.balances[player.id]));
    }
  }
}

async function stage2(players: import('./helpers').Actor[], capital: number): Promise<void> {
  const board = players[0]!.view!.board!;
  expect(board.cells).toHaveLength(40);
  for (const p of players) {
    await expect.poll(() => p.view?.board).toEqual(board);
    await expect.poll(() => Object.values(p.view!.balances)).toEqual(players.map(() => capital));
    // This scenario inspects the board before rolling for order.
    const dialog = p.page.getByRole('dialog', { name: 'Кто ходит первым' });
    if (p.view?.phase === 'setup') {
      await expect(dialog).toBeVisible();
      await dialog.press('Escape');
      await expect(p.page.locator(sel('open-setup'))).toBeFocused();
    }
    const canvas = p.page.locator(sel('board')).locator(sel('board-canvas'));
    await expect(canvas).toBeVisible();
    const box = (await canvas.boundingBox())!;
    const cell = board.cells.find(c => c.asset)!;
    const rect = cellRect(cell.index, box.width);
    await canvas.click({ position: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } });
    const card = p.page.locator(sel('asset-card'));
    await expect(card.locator(sel('asset-title'))).toHaveText(cell.asset!.name);
    await expect(card).toContainText(cell.asset!.categoryName);
    await expect(card).toContainText(money(cell.asset!.price));
    for (const other of board.cells.filter(c => c.index !== cell.index && c.asset?.groupId === cell.asset!.groupId)) {
      await expect(card).toContainText(other.asset!.name);
    }
    await expect(p.page.locator(sel('asset-close'))).toHaveAccessibleName('Закрыть карточку актива');
    await p.page.locator(sel('asset-close')).click();
    if (p.view?.phase === 'setup') {
      await p.page.locator(sel('open-setup')).click();
      await expect(dialog).toBeVisible();
    }
  }
  await panels(players);
}

test('two guests: generated boards agree, capital C(2), and new games differ', async ({ actors }) => {
  test.skip(process.env['E2E_DETERMINISTIC'] === '1', 'Composition variation uses production entropy');
  const boards = [];
  const players = await actors(2);
  for (let game = 0; game < 2; game++) {
    const room = await createRoom(players[0]!); await join(players[1]!, room);
    await start(players); await stage2(players, 29910);
    boards.push(players[0]!.view!.board!.cells.map(c => c.asset?.name ?? c.kind));
    await resign(players[1]!);
    for (const p of players) await p.page.locator(sel('return-lobby')).click();
  }
  expect(boards[0]).not.toEqual(boards[1]);
});
