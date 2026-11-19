import { money } from './ru-text';
import { AUCTION_RESPONSE_MS, AUCTION_RESPONSE_TARGET_KIND, nextBidAmount, type AuctionState } from '../packages/game-core/src/index';
import playwrightConfig from '../playwright.config';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { BOARD_SIZE, cellRect, tokenSlot } from '../apps/client/src/widgets/board/layout';
import { test, expect, sel, createRoom, join, start, setup, active, action, sendRaw, waitGameReady, captureScreens, type Actor } from './helpers';
import type { TestInfo } from '@playwright/test';

/**
 * Stage 3 evidence on the production stack (CSPRNG dice, restartable). The
 * scenarios follow what the server projects: they roll until the active
 * player is offered a free asset and never compute an outcome themselves.
 */
const restartCommand = process.env['E2E_RESTART_COMMAND'] ?? "sg docker -c 'docker compose -p s1-e2e restart server'";
/** Frame receipt is slightly later than the server transition; allow 1 s of transport delay. */
const TRANSPORT_MS = 1_000;
const expectTimeout = playwrightConfig.expect!.timeout!;
/** Tight polling for the many short waits of a bidding round. */
const fast = { intervals: [20] };

test('stage 3: buy, auction won by another player, unsold auction with AFK pass, bid above balance', async ({ actors }, info) => {
  test.skip(process.env['E2E_DETERMINISTIC'] === '1', 'Uses the production stack');
  test.setTimeout(600_000);
  const players = await threePlayers(actors, true);

  // 1. Buy at the fixed price.
  let actor = await nextOffer(players);
  const bought = actor.view!.purchase!;
  const price = assetAt(actor, bought.cell).price;
  const beforeBuy = structuredClone(actor.view!.balances);
  for (const p of players) {
    if (p === actor) await expect(p.page.locator(sel('purchase'))).toBeVisible();
    else {
      await expect(p.page.locator(sel('purchase-status'))).toBeVisible();
      await expect(p.page.locator('[role="dialog"], [aria-modal]')).toHaveCount(0);
    }
    await expect(p.page.locator(sel('buy'))).toHaveCount(p === actor ? 1 : 0);
  }
  const observer = players.find(p => p !== actor)!;
  await expect(observer.page.locator('[role="dialog"], [aria-modal]')).toHaveCount(0);
  await expect(observer.page.locator('[data-testid="purchase-status"] [role="status"]')).toContainText(assetAt(observer, bought.cell).name);
  await captureScreens(observer.page, 'purchase-observer');
  if (process.env['E2E_DIALOG_EVIDENCE'] === '1') await capture(observer, info, 'purchase-bystander-1440');
  await observer.page.locator(sel('game-tab-assets')).click();
  await captureScreens(observer.page, 'assets');
  await observer.page.locator(sel('game-tab-board')).click();
  await observer.page.locator(sel('game-tab-journal')).click();
  await captureScreens(observer.page, 'journal');
  await observer.page.locator(sel('chat-input')).fill('Chat during purchase');
  await observer.page.locator(sel('chat-send')).click();
  await expect(observer.page.locator(sel('journal-entry')).filter({ hasText: 'Chat during purchase' })).toBeVisible();
  await observer.page.locator(sel('game-tab-more')).click();
  await captureScreens(observer.page, 'more');
  await observer.page.locator(sel('game-tab-journal')).click();
  for (const recipient of players) {
    await expect.poll(() => recipient.chats.some(message => message.text === 'Chat during purchase' && message.authorId === observer.id)).toBe(true);
  }
  // Submit a second valid message immediately: the server's TOO_FAST reason
  // must reach the visible rejection status, not only the socket observer.
  await observer.page.evaluate(() => {
    const form = document.querySelector<HTMLFormElement>('[data-testid="chat-composer"]')!;
    const input = form.querySelector<HTMLTextAreaElement>('[data-testid="chat-input"]')!;
    for (const text of ['Chat before rejection', 'Chat sent too fast']) {
      input.value = text;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      form.requestSubmit();
    }
  });
  const tooFast = observer.page.locator(`${sel('chat-rejection')}[data-reason="TOO_FAST"]`).filter({ hasText: 'Chat sent too fast' });
  await expect(tooFast).toContainText('Chat sent too fast');
  await expect(tooFast).toContainText('Подождите перед отправкой следующего сообщения.');
  const invalidId = `e2e-invalid-chat-${Date.now()}`;
  await observer.page.evaluate(({ clientMsgId }) => {
    (window as unknown as { __e2eSocket: WebSocket }).__e2eSocket.send(JSON.stringify({
      t: 'ChatSend', clientMsgId, text: 'bad\ttext',
    }));
  }, { clientMsgId: invalidId });
  await expect.poll(() => observer.chatAcks.find(ack => ack.clientMsgId === invalidId)).toMatchObject({ ok: false, reason: 'CONTROL_CHARACTER' });
  await observer.page.locator(sel('chat-input')).fill('bad\ttext');
  await expect(observer.page.locator(sel('chat-validation'))).toHaveText('Сообщение содержит недопустимый символ.');
  await expect(observer.page.locator(sel('chat-send'))).toBeDisabled();
  const chatWelcomeCount = observer.welcomes.length;
  await observer.page.reload();
  await waitGameReady(observer);
  await expect.poll(() => observer.welcomes.length).toBeGreaterThan(chatWelcomeCount);
  await observer.page.locator(sel('game-tab-journal')).click();
  await expect(observer.page.locator(sel('journal-entry')).filter({ hasText: 'Chat during purchase' })).toBeVisible();
  const recipient = players.find(p => p !== observer && p !== actor)!;
  const recipientWelcomes = recipient.welcomes.length;
  await recipient.page.reload();
  await waitGameReady(recipient);
  await expect.poll(() => recipient.welcomes.length).toBeGreaterThan(recipientWelcomes);
  await recipient.page.locator(sel('game-tab-journal')).click();
  await expect(recipient.page.locator(sel('journal-entry')).filter({ hasText: 'Chat during purchase' })).toBeVisible();
  const buyFrom = actor.events.length;
  await captureScreens(actor.page, 'purchase');
  if (process.env['E2E_DIALOG_EVIDENCE'] === '1') await capture(actor, info, 'purchase-open');
  await click(actor, players, 'buy');
  expect(actor.events.slice(buyFrom).map(e => e.event)).toEqual([
    { type: 'BalanceChanged', payload: { playerId: actor.id, delta: -price, balance: beforeBuy[actor.id]! - price, reason: 'purchase' } },
    { type: 'AssetPurchased', payload: { playerId: actor.id, assetId: bought.assetId, price } },
  ]);
  await expectBalances(players, { ...beforeBuy, [actor.id]: beforeBuy[actor.id]! - price });
  await expectOwner(players, bought.cell, actor, info);
  await shoot(players, info, 'bought');

  // 2. Decline into an auction: the landing player passes, the next bids, the last passes.
  actor = await nextOffer(players);
  const declined = actor.view!.purchase!;
  const turnId = actor.view!.turn!.turnId;
  const beforeWon = structuredClone(actor.view!.balances);
  await click(actor, players, 'start-auction');
  if (process.env['E2E_DIALOG_EVIDENCE'] === '1') await capture(actor, info, 'auction-open');
  const won = actor.view!.auction!;
  expect(won).toMatchObject({ reason: 'choice', assetId: declined.assetId, responder: actor.id, leader: null, leadingBid: null });
  for (const p of players) {
    await expect(p.page.locator(sel('auction'))).toBeVisible();
    await expect(p.page.locator(sel('purchase'))).toHaveCount(0);
  }
  await respond(players, 'pass');
  const bidder = byId(players, players[0]!.view!.auction!.responder);
  await expect(bidder.page.locator(sel('bid'))).toHaveText(`Поднять до ${money(won.startBid)}`);
  if (process.env['E2E_SCREEN_EVIDENCE'] === '1') {
    await bidder.page.setViewportSize({ width: 1440, height: 900 });
    await captureScreens(bidder.page, 'auction');
    const evidenceDir = process.env['E2E_SCREEN_EVIDENCE_DIR']!;
    writeFileSync(`${evidenceDir}/auction-desktop.png`, await bidder.page.screenshot({ fullPage: true, animations: 'disabled' }));
  }
  const auctionObserver = players.find(p => p.id !== players[0]!.view!.auction!.responder)!;
  await auctionObserver.page.setViewportSize({ width: 390, height: 844 });
  await expect(auctionObserver.page.locator('[role="dialog"], [aria-modal]')).toHaveCount(0);
  await expect(auctionObserver.page.locator(sel('auction'))).toBeVisible();
  await expect(auctionObserver.page.locator(sel('auction-leader'))).toBeVisible();
  await expect(auctionObserver.page.locator(sel('auction-timer'))).toBeVisible();
  await captureScreens(auctionObserver.page, 'auction-observer');
  if (process.env['E2E_DIALOG_EVIDENCE'] === '1') await capture(auctionObserver, info, 'auction-bystander-390');
  await auctionObserver.page.locator(sel('game-tab-journal')).click();
  await auctionObserver.page.locator(sel('chat-input')).fill('Chat during auction');
  await auctionObserver.page.locator(sel('chat-send')).click();
  await expect(auctionObserver.page.locator(sel('journal-entry')).filter({ hasText: 'Chat during auction' })).toBeVisible();
  await auctionObserver.page.locator(sel('game-tab-board')).click();
  await auctionObserver.page.setViewportSize({ width: 1440, height: 900 });
  await respond(players, 'bid');
  await respond(players, 'pass');
  // A chosen auction resumes the same turn. Read at settlement: the resumed
  // turn's deadline keeps running during the slow balance and owner checks below.
  expect(players[0]!.view!.turn!.turnId).toBe(turnId);
  expect(players[0]!.view!.turn!.pausedRemainingMs).toBeNull();
  const wonEvents = eventsOf(players[0]!, won.auctionId);
  expect(wonEvents.find(e => e.type === 'AuctionWon')!.payload).toEqual({ auctionId: won.auctionId, playerId: bidder.id, assetId: won.assetId, amount: won.startBid });
  expect(bidder.id).not.toBe(actor.id);
  await expectBalances(players, { ...beforeWon, [bidder.id]: beforeWon[bidder.id]! - won.startBid });
  await expectOwner(players, declined.cell, bidder, info);
  await shoot(players, info, 'auction-won');

  // 3. Unsold auction; the second participant is AFK and passes after the real 10 s.
  actor = await nextOffer(players);
  const unsoldOffer = actor.view!.purchase!;
  const beforeUnsold = structuredClone(actor.view!.balances);
  await click(actor, players, 'start-auction');
  const unsold = actor.view!.auction!;
  await respond(players, 'pass');
  const afk = await afkPass(players);
  expect(afk.id).not.toBe(actor.id);
  await respond(players, 'pass');
  const unsoldEvents = eventsOf(players[0]!, unsold.auctionId);
  expect(unsoldEvents.map(e => e.type)).toEqual(['AuctionStarted', 'AuctionPassed', 'AuctionPassed', 'AuctionPassed', 'AuctionEndedUnsold']);
  expect(unsoldEvents.filter(e => e.type === 'AuctionPassed').map(e => (e.payload as { auto: boolean }).auto)).toEqual([false, true, false]);
  await expectBalances(players, beforeUnsold);
  await expectOwner(players, unsoldOffer.cell, null, info);
  await shoot(players, info, 'auction-unsold');

  // 4. Bidding until a responder cannot cover the next bid: the button is
  // disabled, and a Bid sent on that client's socket is rejected unchanged.
  actor = await nextOffer(players);
  const contested = actor.view!.purchase!;
  await click(actor, players, 'start-auction');
  const balances = actor.view!.balances;
  // The richest player passes; the two poorer ones bid against each other.
  const passer = [...players].sort((a, b) => balances[b.id]! - balances[a.id]!)[0]!;
  const auctionId = actor.view!.auction!.auctionId;
  // The first responses go through the buttons.
  for (let uiBids = 0; uiBids < 2;) {
    const responder = byId(players, players[0]!.view!.auction!.responder);
    if (responder !== passer) uiBids++;
    await respond(players, responder === passer ? 'pass' : 'bid');
  }
  if (players[0]!.view!.auction!.responder === passer.id) await respond(players, 'pass');
  let poor: Actor | undefined;
  for (let bids = 0; bids < 500; bids++) {
    const auction = players[0]!.view!.auction;
    expect(auction?.auctionId).toBe(auctionId);
    const responder = byId(players, auction!.responder);
    if (nextBidAmount(auction!) > players[0]!.view!.balances[responder.id]!) {
      poor = responder;
      break;
    }
    await respond(players, 'bid');
  }
  if (!poor) throw Error('No responder exceeded their balance in 500 bids');
  const saved = structuredClone(poor.view!);
  await expect(poor.page.locator(sel('bid'))).toHaveText(`Поднять до ${money(nextBidAmount(saved.auction!))}`);
  const label = await poor.page.locator(sel('bid')).innerText();
  const amount = Number(label.replace('Поднять до ', '').replace(/\s/g, ''));
  expect(amount).toBeGreaterThan(saved.balances[poor.id]!);
  await expect(poor.page.locator(sel('bid'))).toBeDisabled();
  await expect(poor.page.locator(sel('pass'))).toBeEnabled();
  const ack = await socketCommand(players, poor, 'Bid', saved.auction!.responseId, 'rejected');
  expect(ack).toMatchObject({ revision: saved.revision, error: { code: 'INSUFFICIENT_FUNDS' } });
  // The authoritative rejection acknowledgement carries the unchanged revision;
  // verify that all observed client views still match that same state.
  await sync(players, saved.revision);
  for (const p of players) {
    expect(p.view!.revision).toBe(saved.revision);
    expect(p.view!.auction).toEqual(saved.auction);
    expect(p.view!.balances).toEqual(saved.balances);
  }
  const panel = info.outputPath('over-balance-rejected-panel.png');
  await poor.page.locator(sel('auction')).screenshot({ path: panel });
  await info.attach('over-balance-rejected-panel', { path: panel, contentType: 'image/png' });
  const leader = byId(players, saved.auction!.leader!);
  await respond(players, 'pass');
  // Full-page screenshots only after the Pass, outside the response window.
  await shoot(players, info, 'over-balance-settled');
  const contestEvents = eventsOf(players[0]!, saved.auction!.auctionId);
  expect(contestEvents.find(e => e.type === 'AuctionWon')!.payload).toMatchObject({ playerId: leader.id, amount: saved.auction!.leadingBid });
  await expectBalances(players, { ...saved.balances, [leader.id]: saved.balances[leader.id]! - saved.auction!.leadingBid! });
  await expectOwner(players, contested.cell, leader, info);
});

test('stage 3: turn deadline starts the auction, reload and server restart keep it, the turn closes', async ({ actors }, info) => {
  test.skip(process.env['E2E_DETERMINISTIC'] === '1', 'Server restart needs the production stack');
  test.setTimeout(600_000);
  const players = await threePlayers(actors), host = players[0]!;
  await Promise.all(players.map(p => p.page.setViewportSize({ width: 1440, height: 900 })));
  const actor = await nextOffer(players);
  const offer = actor.view!.purchase!;
  const turn = structuredClone(actor.view!.turn!);
  // No decision: the turn deadline opens the auction.
  await expect.poll(() => host.view?.auction?.reason, { timeout: Math.max(0, turn.deadline - Date.now()) + expectTimeout }).toBe('timeout');
  const auction = host.view!.auction!;
  const started = host.events.find(e => e.event.type === 'AuctionStarted' && (e.event.payload as AuctionState).auctionId === auction.auctionId)!;
  expect(started.at).toBeGreaterThanOrEqual(turn.deadline);
  expect(started.at - turn.deadline).toBeLessThan(TRANSPORT_MS + 1_000);
  expect(auction).toMatchObject({ assetId: offer.assetId, responder: actor.id, reason: 'timeout' });
  for (const p of players) await expect(p.page.locator(sel('auction'))).toBeVisible();
  await respond(players, 'bid');

  // Reload the next responder's tab during the auction.
  const reloaded = byId(players, host.view!.auction!.responder);
  const beforeReload = structuredClone(reloaded.view!);
  const welcomes = reloaded.welcomes.length;
  await reloaded.page.reload();
  await waitGameReady(reloaded);
  await expect.poll(() => reloaded.welcomes.length).toBeGreaterThan(welcomes);
  expect(reloaded.view!.revision).toBe(beforeReload.revision);
  expect(reloaded.view!.auction).toEqual(beforeReload.auction);
  await expect(reloaded.page.locator(sel('auction'))).toBeVisible();
  await expect(reloaded.page.locator(sel('bid'))).toBeEnabled();
  // The reloaded tab is responder: the bid goes in before any slow step, inside its 10 s window.
  expect(beforeReload.auction!.responseDeadline - Date.now(), 'response window left for the reloaded Bid (ms)').toBeGreaterThan(0);
  await respond(players, 'bid');

  // Restart the server while the next response is due. That Bid opened the
  // saved responder's window: nothing slow runs before the restart.
  const saved = structuredClone(host.view!);
  // The auction runs inside the turn that reached its deadline.
  expect(saved.turn!.turnId).toBe(turn.turnId);
  const welcomesBeforeRestart = players.map(p => p.welcomes.length);
  const restartAt = Date.now();
  execFileSync('bash', ['-lc', restartCommand], { stdio: 'pipe' });
  for (const [i, p] of players.entries()) {
    await expect.poll(() => p.welcomes.length).toBeGreaterThan(welcomesBeforeRestart[i]!);
    await expect(p.page.locator(sel('offline'))).toHaveCount(0);
  }
  const reconnectedAt = Date.now();
  info.annotations.push({ type: 'restart-ms', description: String(reconnectedAt - restartAt) });
  info.annotations.push({ type: 'window-left-at-restart-ms', description: String(saved.auction!.responseDeadline - restartAt) });
  info.annotations.push({ type: 'window-left-at-reconnect-ms', description: String(saved.auction!.responseDeadline - reconnectedAt) });
  // The restart must leave the response window open, or the evidence below is about a timeout.
  expect(reconnectedAt, 'restart and reconnect finished inside the response window').toBeLessThan(saved.auction!.responseDeadline - 1_000);
  for (const p of players) {
    expect(p.view!.revision).toBe(saved.revision);
    expect(p.view!.auction).toEqual(saved.auction);
    expect(p.view!.balances).toEqual(saved.balances);
    expect(p.view!.turn).toEqual(saved.turn);
    await expect(p.page.locator(sel('auction'))).toBeVisible();
  }
  // The recovered server still enforces the persisted response deadline:
  // observe the auto-pass of the saved responder, whatever the current view shows.
  const afk = await afkPass(players, saved.auction!, saved.revision);
  expect(afk.id).toBe(saved.auction!.responder);
  // Full-page screenshots only after the AFK pass, outside every response
  // window they could delay; the auction is still open.
  await shoot(players, info, 'auction-after-reload');
  await shoot(players, info, 'auction-after-restart');
  while (host.view!.auction) await respond(players, 'pass');
  const events = eventsOf(host, auction.auctionId);
  expect(events.find(e => e.type === 'AuctionWon')!.payload).toMatchObject({ playerId: reloaded.id, amount: saved.auction!.leadingBid });
  await expectOwner(players, offer.cell, reloaded, info);
  // An auction opened by the deadline closes the turn after settlement.
  const settledAt = host.events.findIndex(e => (e.event.type === 'AuctionWon' || e.event.type === 'AuctionEndedUnsold')
    && (e.event.payload as { auctionId: string }).auctionId === auction.auctionId);
  const endedAt = host.events.findIndex(e => e.event.type === 'TurnEnded'
    && (e.event.payload as { turnId: string }).turnId === turn.turnId);
  expect(settledAt, 'auction settled').toBeGreaterThanOrEqual(0);
  expect(endedAt, 'deadline turn ended').toBeGreaterThan(settledAt);
  expect(host.events[endedAt]!.event.payload).toMatchObject({ turnId: turn.turnId, reason: 'timeout' });
  expect(host.view!.turn!.turnId).not.toBe(turn.turnId);
});

type Actors = (count: number, invite?: string) => Promise<Actor[]>;

async function threePlayers(actors: Actors, mobile = false): Promise<Actor[]> {
  const players = await actors(3);
  const room = await createRoom(players[0]!);
  for (const p of players.slice(1)) await join(p, room);
  await start(players);
  await captureScreens(players[0]!.page, 'turn-order');
  await setup(players);
  await captureScreens(players[0]!.page, 'game');
  await captureScreens(players[0]!.page, 'board');
  if (mobile) await Promise.all(players.map(p => p.page.setViewportSize({ width: 390, height: 844 })));
  return players;
}

function byId(players: Actor[], id: string): Actor {
  return players.find(p => p.id === id)!;
}

function assetAt(actor: Actor, cell: number) {
  return actor.view!.board!.cells[cell]!.asset!;
}

function eventsOf(actor: Actor, auctionId: string) {
  const all = actor.events.map(e => e.event);
  const first = all.findIndex(e => e.type === 'AuctionStarted' && (e.payload as AuctionState).auctionId === auctionId);
  return all.slice(first).filter((e, i) => i === 0 || (e.payload as { auctionId?: string }).auctionId === auctionId);
}

/** Every client reaches `revision`. */
async function sync(players: Actor[], revision: number): Promise<void> {
  for (const p of players) await expect.poll(() => p.view?.revision, fast).toBeGreaterThanOrEqual(revision);
}

/** Click a decision button and wait for the server's update on every client. */
async function click(actor: Actor, players: Actor[], name: string): Promise<void> {
  await action(actor, name);
  await sync(players, actor.view!.revision);
}

/** The current auction responder clicks Bid or Pass in their own tab. */
async function respond(players: Actor[], button: 'bid' | 'pass'): Promise<void> {
  const host = players[0]!;
  const responder = byId(players, host.view!.auction!.responder);
  await expect.poll(() => responder.view?.revision, fast).toBe(host.view!.revision);
  await click(responder, players, button);
}

let commandSeq = 0;
/** Sends an auction response on the client's own socket and waits for its Ack (and, if accepted, the update everywhere). */
async function socketCommand(players: Actor[], actor: Actor, type: 'Bid' | 'PassAuction', responseId: string, outcome: 'accepted' | 'rejected') {
  const commandId = `e2e-${type}-${++commandSeq}`;
  await sendRaw(actor, {
    t: 'Command', commandId, type, payload: null,
    expected: { kind: 'target', target: { kind: AUCTION_RESPONSE_TARGET_KIND, id: responseId } },
  });
  await expect.poll(() => actor.acks.find(a => a.commandId === commandId), fast).toBeDefined();
  const ack = actor.acks.find(a => a.commandId === commandId)!;
  expect(ack.outcome).toBe(outcome);
  if (outcome === 'accepted') await sync(players, ack.revision);
  return ack;
}

/** Roll and end turns until the active player is offered a free asset. */
async function nextOffer(players: Actor[]): Promise<Actor> {
  for (let i = 0; i < 100; i++) {
    const actor = await active(players);
    const view = actor.view!;
    if (view.purchase?.playerId === actor.id) {
      await expect(actor.page.locator(sel('buy'))).toBeVisible();
      return actor;
    }
    await action(actor, view.turn!.rolled ? 'EndTurn' : 'RollDice');
  }
  throw Error('No purchase offer in 100 actions');
}

/**
 * The responder of `auction` (by default the current one) does nothing; the
 * server passes for them at that auction's response deadline. `revision` is
 * the revision whose frame made them responder.
 */
async function afkPass(players: Actor[], auction = players[0]!.view!.auction!, revision = players[0]!.view!.revision): Promise<Actor> {
  const host = players[0]!;
  const afk = byId(players, auction.responder);
  // The frame that made them responder; the deadline is 10 s after it.
  const assigned = host.events.findLast(e => e.revision === revision)
    ?? host.events.at(-1)!;
  expect(Math.abs(auction.responseDeadline - assigned.at - AUCTION_RESPONSE_MS)).toBeLessThanOrEqual(TRANSPORT_MS);
  // The UI checks below need the responder's window to be still open.
  expect(auction.responseDeadline - Date.now(), 'response window left for the AFK responder checks (ms)').toBeGreaterThanOrEqual(1_000);
  await expect(afk.page.locator(sel('pass'))).toBeEnabled();
  await expect(afk.page.locator(sel('auction-timer'))).toHaveText(/^(10|[1-9]) с$/);
  const isPass = (e: { event: { type: string; payload: unknown } }) => e.event.type === 'AuctionPassed'
    && (e.event.payload as { auctionId: string; playerId: string }).auctionId === auction.auctionId
    && (e.event.payload as { playerId: string }).playerId === afk.id;
  await expect.poll(() => host.events.some(isPass), { timeout: AUCTION_RESPONSE_MS + expectTimeout }).toBe(true);
  const pass = host.events.find(isPass)!;
  expect(pass.event.payload).toMatchObject({ auto: true });
  expect(pass.at).toBeGreaterThanOrEqual(auction.responseDeadline);
  expect(pass.at - auction.responseDeadline).toBeLessThan(TRANSPORT_MS);
  await sync(players, pass.revision);
  return afk;
}

async function expectBalances(players: Actor[], balances: Record<string, number>): Promise<void> {
  for (const p of players) {
    await expect.poll(() => p.view?.balances).toEqual(balances);
    for (const [index, player] of players.entries()) {
      const row = p.page.locator(`${sel('player-balance')}[data-player-id="${player.id}"]`);
      await expect(row.locator(sel('player-balance-name'))).toHaveText(`Player ${index + 1}`);
      await expect(row.locator(sel('player-balance-value'))).toHaveText(money(balances[player.id]));
    }
  }
}

/** The owner as every client shows it: projection, canvas owner marker and asset card. */
async function expectOwner(players: Actor[], cell: number, owner: Actor | null, info: TestInfo): Promise<void> {
  const assetId = assetAt(players[0]!, cell).assetId;
  for (const p of players) {
    await expect.poll(() => p.view?.owners[assetId]).toBe(owner?.id);
    if ((p.page.viewportSize()?.width ?? 1440) < 1024) await p.page.locator(sel('game-tab-board')).click();
    const playerColors = await p.page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return Array.from({ length: 6 }, (_, index) => Number.parseInt(style.getPropertyValue(`--player-${index + 1}`).trim().slice(1), 16));
    });
    const color = owner === null ? null : playerColors[p.view!.players.findIndex(x => x.id === owner.id)]!;
    let lastSample: Awaited<ReturnType<typeof markerSamples>> | undefined;
    try {
      await expect.poll(async () => {
        lastSample = await markerSamples(p, cell);
        const matches = lastSample.samples.filter(({ pixels }) => color === null
          ? pixels.every(pixel => !playerColors.some(playerColor => closeToColor(pixel, playerColor)))
          : pixels.some(pixel => closeToColor(pixel, color))).length;
        return lastSample.samples.length > 0 && matches > lastSample.samples.length / 2;
      }).toBe(true);
    } catch (error) {
      if (lastSample !== undefined) {
        const path = info.outputPath(`marker-failure-${p.id}.png`);
        const diagnosticPath = info.outputPath(`marker-failure-${p.id}.json`);
        const diagnostic = {
          cell, ownerId: owner?.id ?? null, expectedColor: color, sample: { ...lastSample, png: undefined },
          positions: p.view?.positions, playerOrder: p.view?.players.map(({ id }) => id),
        };
        writeFileSync(path, lastSample.png);
        writeFileSync(diagnosticPath, JSON.stringify(diagnostic, null, 2));
        await info.attach(`marker-failure-${p.id}.png`, { path, contentType: 'image/png' });
        await info.attach(`marker-failure-${p.id}.json`, { path: diagnosticPath, contentType: 'application/json' });
      }
      throw error;
    }
    const canvas = p.page.locator(sel('board')).locator(sel('board-canvas'));
    const box = (await canvas.boundingBox())!;
    const rect = cellRect(cell, box.width);
    await canvas.click({ position: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } });
    const card = p.page.locator(sel('asset-card'));
    await expect(card.locator(sel('asset-title'))).toHaveText(assetAt(p, cell).name);
    await expect(card.locator(sel('asset-owner'))).toHaveText(owner === null ? 'свободно' : `Player ${players.indexOf(owner) + 1}`);
    await expect(p.page.locator(sel('asset-close'))).toHaveAccessibleName('Закрыть карточку актива');
  await p.page.locator(sel('asset-close')).click();
  }
}

function closeToColor(pixel: number, target: number): boolean {
  const r = (pixel >> 16) & 0xff, g = (pixel >> 8) & 0xff, b = pixel & 0xff;
  const tr = (target >> 16) & 0xff, tg = (target >> 8) & 0xff, tb = target & 0xff;
  return (r - tr) ** 2 + (g - tg) ** 2 + (b - tb) ** 2 <= 12 ** 2;
}

/** RGB at several unoccluded points along the ownership border. */
async function markerSamples(p: Actor, cell: number): Promise<{
  samples: { pixels: number[]; x: number; y: number }[]; box: { x: number; y: number; width: number; height: number };
  devicePixelRatio: number; screenshotSize: { width: number; height: number }; png: Buffer;
}> {
  const canvas = p.page.locator(sel('board')).locator(sel('board-canvas'));
  const box = (await canvas.boundingBox())!;
  const r = cellRect(cell, BOARD_SIZE);
  const candidates: { x: number; y: number }[] = [];
  const inset = 3.5, corner = 10, spacing = 6;
  for (let offset = corner; offset <= r.width - corner; offset += spacing) {
    candidates.push({ x: r.x + offset, y: r.y + inset });
    candidates.push({ x: r.x + offset, y: r.y + r.height - inset });
  }
  for (let offset = corner; offset <= r.height - corner; offset += spacing) {
    candidates.push({ x: r.x + inset, y: r.y + offset });
    candidates.push({ x: r.x + r.width - inset, y: r.y + offset });
  }
  // Avoid token and active-ring positions in the projected view. The generous
  // 15-unit exclusion covers the token radius and active ring even as tokens
  // settle after their movement animation.
  const tokenCenters = p.view!.players.flatMap((player, index) =>
    p.view!.positions[player.id] === cell ? [tokenSlot(r, index)] : []);
  const safe = candidates.filter(point => tokenCenters.every(center => Math.hypot(point.x - center.x, point.y - center.y) >= 15));
  const png = await canvas.screenshot();
  const encoded = png.toString('base64');
  const sample = await p.page.evaluate(async ({ png, points, box }) => {
    const image = new Image();
    image.src = `data:image/png;base64,${png}`;
    await image.decode();
    const c = document.createElement('canvas');
    c.width = image.width; c.height = image.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(image, 0, 0);
    const samples = points.map(({ cssX, cssY }) => {
      // Convert canvas logical coordinates to CSS, then CSS to actual captured
      // PNG pixels. This remains correct if the screenshot scale differs from
      // the element's CSS box after a viewport change.
      const x = Math.floor(cssX * image.width / box.width);
      const y = Math.floor(cssY * image.height / box.height);
      const pixels: number[] = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const px = Math.max(0, Math.min(image.width - 1, x + dx));
        const py = Math.max(0, Math.min(image.height - 1, y + dy));
        const [red, green, blue] = ctx.getImageData(px, py, 1, 1).data;
        pixels.push((red! << 16) | (green! << 8) | blue!);
      }
      return { pixels, x, y };
    });
    return {
      samples, box, devicePixelRatio: window.devicePixelRatio,
      screenshotSize: { width: image.width, height: image.height },
    };
  }, {
    png: encoded, box,
    points: safe.map(point => ({ cssX: point.x * box.width / BOARD_SIZE, cssY: point.y * box.height / BOARD_SIZE })),
  });
  return { ...sample, png };
}

async function shoot(players: Actor[], info: TestInfo, name: string): Promise<void> {
  for (const [i, p] of players.entries()) {
    const path = info.outputPath(`${name}-${i}.png`);
    await p.page.screenshot({ path, fullPage: true });
    await info.attach(`${name}-${i}`, { path, contentType: 'image/png' });
  }
}

async function capture(actor: Actor, info: TestInfo, name: string): Promise<void> {
  const original = actor.page.viewportSize() ?? { width: 1280, height: 720 };
  for (const [tag, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]] as const) {
    await actor.page.setViewportSize({ width, height });
    const path = info.outputPath(`${name}-${tag}.png`);
    await actor.page.screenshot({ path, fullPage: false });
    await info.attach(`${name}-${tag}`, { path, contentType: 'image/png' });
  }
  await actor.page.setViewportSize(original);
}
