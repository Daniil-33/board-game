import { AUCTION_RESPONSE_MS, AUCTION_RESPONSE_TARGET_KIND, nextBidAmount, type AuctionState } from '../packages/game-core/src/index';
import playwrightConfig from '../playwright.config';
import { execFileSync } from 'node:child_process';
import { cellRect } from '../apps/client/src/board/layout';
import { BOARD_SIZE, TOKEN_COLORS } from '../apps/client/src/board/BoardCanvas';
import { test, expect, sel, createRoom, join, start, setup, active, sendRaw, type Actor } from './helpers';
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
  const players = await threePlayers(actors);

  // 1. Buy at the fixed price.
  let actor = await nextOffer(players);
  const bought = actor.view!.purchase!;
  const price = assetAt(actor, bought.cell).price;
  const beforeBuy = structuredClone(actor.view!.balances);
  for (const p of players) {
    await expect(p.page.locator(sel('purchase'))).toBeVisible();
    await expect(p.page.locator(sel('buy'))).toHaveCount(p === actor ? 1 : 0);
  }
  const buyFrom = actor.events.length;
  await click(actor, players, 'buy');
  expect(actor.events.slice(buyFrom).map(e => e.event)).toEqual([
    { type: 'BalanceChanged', payload: { playerId: actor.id, delta: -price, balance: beforeBuy[actor.id]! - price, reason: 'purchase' } },
    { type: 'AssetPurchased', payload: { playerId: actor.id, assetId: bought.assetId, price } },
  ]);
  await expectBalances(players, { ...beforeBuy, [actor.id]: beforeBuy[actor.id]! - price });
  await expectOwner(players, bought.cell, actor);
  await shoot(players, info, 'bought');

  // 2. Decline into an auction: the landing player passes, the next bids, the last passes.
  actor = await nextOffer(players);
  const declined = actor.view!.purchase!;
  const turnId = actor.view!.turn!.turnId;
  const beforeWon = structuredClone(actor.view!.balances);
  await click(actor, players, 'start-auction');
  const won = actor.view!.auction!;
  expect(won).toMatchObject({ reason: 'choice', assetId: declined.assetId, responder: actor.id, leader: null, leadingBid: null });
  for (const p of players) {
    await expect(p.page.locator(sel('auction'))).toBeVisible();
    await expect(p.page.locator(sel('purchase'))).toHaveCount(0);
  }
  await respond(players, 'pass');
  const bidder = byId(players, players[0]!.view!.auction!.responder);
  await expect(bidder.page.locator(sel('bid'))).toHaveText(`Bid ${won.startBid}`);
  await respond(players, 'bid');
  await respond(players, 'pass');
  const wonEvents = eventsOf(players[0]!, won.auctionId);
  expect(wonEvents.find(e => e.type === 'AuctionWon')!.payload).toEqual({ auctionId: won.auctionId, playerId: bidder.id, assetId: won.assetId, amount: won.startBid });
  expect(bidder.id).not.toBe(actor.id);
  await expectBalances(players, { ...beforeWon, [bidder.id]: beforeWon[bidder.id]! - won.startBid });
  await expectOwner(players, declined.cell, bidder);
  // A chosen auction resumes the same turn.
  expect(players[0]!.view!.turn!.turnId).toBe(turnId);
  expect(players[0]!.view!.turn!.pausedRemainingMs).toBeNull();
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
  await expectOwner(players, unsoldOffer.cell, null);
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
  // The long tail of raises runs in the bidders' pages on their own sockets,
  // so the round is not paced by one Playwright call per bid.
  const bidders = players.filter(p => p !== passer);
  for (const b of bidders) await autoBid(b, auctionId);
  const first = byId(players, players[0]!.view!.auction!.responder);
  await socketCommand(players, first, 'Bid', first.view!.auction!.responseId, 'accepted');
  // Wait until the responder's balance no longer covers the next bid.
  await expect.poll(() => {
    const a = players[0]!.view!.auction;
    return a !== null && a.auctionId === auctionId && nextBidAmount(a) > players[0]!.view!.balances[a.responder]!;
  }, { timeout: 300_000, intervals: [100] }).toBe(true);
  const poor = byId(players, players[0]!.view!.auction!.responder);
  await expect.poll(() => poor.view?.revision).toBe(players[0]!.view!.revision);
  const saved = structuredClone(poor.view!);
  await expect(poor.page.locator(sel('bid'))).toHaveText(`Bid ${nextBidAmount(saved.auction!)}`);
  const label = await poor.page.locator(sel('bid')).innerText();
  const amount = Number(label.replace('Bid ', ''));
  expect(amount).toBeGreaterThan(saved.balances[poor.id]!);
  await expect(poor.page.locator(sel('bid'))).toBeDisabled();
  await expect(poor.page.locator(sel('pass'))).toBeEnabled();
  // Everything up to the Pass below runs inside the poor responder's 10 s window;
  // fail as a timing problem, not as "the rejected Bid changed state".
  const marginMs = () => saved.auction!.responseDeadline - Date.now();
  expect(marginMs(), 'response window left before the over-balance Bid (ms)').toBeGreaterThan(5_000);
  const ack = await socketCommand(players, poor, 'Bid', saved.auction!.responseId, 'rejected');
  expect(ack).toMatchObject({ revision: saved.revision, error: { code: 'INSUFFICIENT_FUNDS' } });
  // Give a wrongly accepted command time to surface before checking that nothing changed.
  await poor.page.waitForTimeout(1_000);
  expect(marginMs(), 'response window still open for the unchanged-state checks (ms)').toBeGreaterThan(1_000);
  for (const p of players) {
    expect(p.view!.revision).toBe(saved.revision);
    expect(p.view!.auction).toEqual(saved.auction);
    expect(p.view!.balances).toEqual(saved.balances);
  }
  const panel = info.outputPath('over-balance-rejected-panel.png');
  await poor.page.locator(sel('auction')).screenshot({ path: panel });
  await info.attach('over-balance-rejected-panel', { path: panel, contentType: 'image/png' });
  const leader = byId(players, saved.auction!.leader!);
  expect(marginMs(), 'response window still open for the Pass (ms)').toBeGreaterThan(0);
  await respond(players, 'pass');
  // Full-page screenshots only after the Pass, outside the response window.
  await shoot(players, info, 'over-balance-settled');
  const contestEvents = eventsOf(players[0]!, saved.auction!.auctionId);
  expect(contestEvents.find(e => e.type === 'AuctionWon')!.payload).toMatchObject({ playerId: leader.id, amount: saved.auction!.leadingBid });
  await expectBalances(players, { ...saved.balances, [leader.id]: saved.balances[leader.id]! - saved.auction!.leadingBid! });
  await expectOwner(players, contested.cell, leader);
});

test('stage 3: turn deadline starts the auction, reload and server restart keep it, the turn closes', async ({ actors }, info) => {
  test.skip(process.env['E2E_DETERMINISTIC'] === '1', 'Server restart needs the production stack');
  test.setTimeout(600_000);
  const players = await threePlayers(actors), host = players[0]!;
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
  await expect(reloaded.page.locator('[data-screen="game"]')).toBeVisible();
  await expect.poll(() => reloaded.welcomes.length).toBeGreaterThan(welcomes);
  expect(reloaded.view!.revision).toBe(beforeReload.revision);
  expect(reloaded.view!.auction).toEqual(beforeReload.auction);
  await expect(reloaded.page.locator(sel('auction'))).toBeVisible();
  await expect(reloaded.page.locator(sel('bid'))).toBeEnabled();
  await shoot(players, info, 'auction-after-reload');
  await respond(players, 'bid');

  // Restart the server while the next response is due.
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
  // The restart must leave the response window open, or the evidence below is about a timeout.
  expect(reconnectedAt, 'restart and reconnect finished inside the response window').toBeLessThan(saved.auction!.responseDeadline - 1_000);
  for (const p of players) {
    expect(p.view!.revision).toBe(saved.revision);
    expect(p.view!.auction).toEqual(saved.auction);
    expect(p.view!.balances).toEqual(saved.balances);
    expect(p.view!.turn).toEqual(saved.turn);
    await expect(p.page.locator(sel('auction'))).toBeVisible();
  }
  await shoot(players, info, 'auction-after-restart');
  // The recovered server still enforces the persisted response deadline.
  const afk = await afkPass(players);
  expect(afk.id).toBe(saved.auction!.responder);
  while (host.view!.auction) await respond(players, 'pass');
  const events = eventsOf(host, auction.auctionId);
  expect(events.find(e => e.type === 'AuctionWon')!.payload).toMatchObject({ playerId: reloaded.id, amount: saved.auction!.leadingBid });
  await expectOwner(players, offer.cell, reloaded);
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

async function threePlayers(actors: Actors): Promise<Actor[]> {
  const players = await actors(3);
  const room = await createRoom(players[0]!);
  for (const p of players.slice(1)) await join(p, room);
  await start(players);
  await setup(players);
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
  const revision = actor.view!.revision;
  await actor.page.locator(sel(name)).click();
  await expect.poll(() => actor.view?.revision, fast).toBeGreaterThan(revision);
  await sync(players, actor.view!.revision);
}

/** The current auction responder clicks Bid or Pass in their own tab. */
async function respond(players: Actor[], button: 'bid' | 'pass'): Promise<void> {
  const host = players[0]!;
  const responder = byId(players, host.view!.auction!.responder);
  await expect.poll(() => responder.view?.revision, fast).toBe(host.view!.revision);
  await click(responder, players, button);
}

/**
 * Test-only bidder inside the page: whenever this client becomes responder in
 * `auctionId` and its balance covers the next bid (the rule the Bid button
 * uses), it sends Bid on the page's game socket. It stops with the auction.
 */
async function autoBid(actor: Actor, auctionId: string): Promise<void> {
  await actor.page.evaluate(({ me, auctionId, kind }) => {
    const socket = (window as unknown as { __e2eSocket: WebSocket }).__e2eSocket;
    let n = 0;
    const onMessage = (message: MessageEvent) => {
      const frame = JSON.parse(String(message.data));
      if (frame.t !== 'Update' && frame.t !== 'Welcome') return;
      const a = frame.view.auction;
      if (a === null || a.auctionId !== auctionId) { socket.removeEventListener('message', onMessage); return; }
      const next = a.leadingBid === null ? a.startBid : a.leadingBid + a.step;
      if (a.responder !== me || next > frame.view.balances[me]) return;
      socket.send(JSON.stringify({
        t: 'Command', commandId: `e2e-auto-bid-${me}-${++n}`, type: 'Bid', payload: null,
        expected: { kind: 'target', target: { kind, id: a.responseId } },
      }));
    };
    socket.addEventListener('message', onMessage);
  }, { me: actor.id, auctionId, kind: AUCTION_RESPONSE_TARGET_KIND });
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
    await click(actor, players, view.turn!.rolled ? 'EndTurn' : 'RollDice');
  }
  throw Error('No purchase offer in 100 actions');
}

/** The current responder does nothing; the server passes for them at the response deadline. */
async function afkPass(players: Actor[]): Promise<Actor> {
  const host = players[0]!;
  const auction = host.view!.auction!;
  const afk = byId(players, auction.responder);
  // The frame that made them responder; the deadline is 10 s after it.
  const assigned = host.events.findLast(e => e.revision === host.view!.revision)
    ?? host.events.at(-1)!;
  expect(Math.abs(auction.responseDeadline - assigned.at - AUCTION_RESPONSE_MS)).toBeLessThanOrEqual(TRANSPORT_MS);
  await expect(afk.page.locator(sel('pass'))).toBeEnabled();
  await expect(afk.page.locator(sel('auction-timer'))).toHaveText(/^(10|[1-9]) s$/);
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
      const row = p.page.locator(sel('player-balance')).filter({ has: p.page.getByText(`Player ${index + 1}`, { exact: true }) });
      await expect(row.locator('span').first()).toHaveText(String(balances[player.id]));
    }
  }
}

/** The owner as every client shows it: projection, canvas owner marker and asset card. */
async function expectOwner(players: Actor[], cell: number, owner: Actor | null): Promise<void> {
  const assetId = assetAt(players[0]!, cell).assetId;
  for (const p of players) {
    await expect.poll(() => p.view?.owners[assetId]).toBe(owner?.id);
    const color = owner === null ? null : TOKEN_COLORS[p.view!.players.findIndex(x => x.id === owner.id)]!;
    await expect.poll(async () => {
      const pixel = await markerPixel(p, cell);
      return color === null ? !TOKEN_COLORS.includes(pixel as never) : pixel === color;
    }).toBe(true);
    const canvas = p.page.locator(sel('board')).locator('canvas');
    const box = (await canvas.boundingBox())!;
    const rect = cellRect(cell, box.width);
    await canvas.click({ position: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } });
    const card = p.page.locator(sel('asset-card'));
    await expect(card.getByRole('heading', { level: 2 })).toHaveText(assetAt(p, cell).name);
    await expect(card.locator(sel('asset-owner'))).toHaveText(owner === null ? 'free' : `Player ${players.indexOf(owner) + 1}`);
    await p.page.getByRole('button', { name: 'Close asset card' }).click();
  }
}

/** RGB of the canvas pixel at the centre of the owner marker of `cell`, read from a screenshot. */
async function markerPixel(p: Actor, cell: number): Promise<number> {
  const canvas = p.page.locator(sel('board')).locator('canvas');
  const box = (await canvas.boundingBox())!;
  const r = cellRect(cell, BOARD_SIZE);
  // BoardScene draws the 10x10 marker 14 units in from the cell's bottom-right corner.
  const scale = box.width / BOARD_SIZE;
  const x = Math.floor((r.x + r.width - 9) * scale), y = Math.floor((r.y + r.height - 9) * scale);
  const png = (await canvas.screenshot()).toString('base64');
  return p.page.evaluate(async ({ png, x, y }) => {
    const image = new Image();
    image.src = `data:image/png;base64,${png}`;
    await image.decode();
    const c = document.createElement('canvas');
    c.width = image.width; c.height = image.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(image, 0, 0);
    const [red, green, blue] = ctx.getImageData(x, y, 1, 1).data;
    return (red! << 16) | (green! << 8) | blue!;
  }, { png, x, y });
}

async function shoot(players: Actor[], info: TestInfo, name: string): Promise<void> {
  for (const [i, p] of players.entries()) {
    const path = info.outputPath(`${name}-${i}.png`);
    await p.page.screenshot({ path, fullPage: true });
    await info.attach(`${name}-${i}`, { path, contentType: 'image/png' });
  }
}
