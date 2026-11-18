import { money } from './ru-text';
import { execFileSync } from 'node:child_process';
import type { StateView } from '../packages/game-core/src/index';
import { test, expect, sel, active, resign, type Actor } from './helpers';
import { fast, q, click, load, shoot, balances, card, close } from './fixture-helpers';

// Explicit opt-in: earlier stages always run against their original stacks.
test.beforeEach(() => test.skip(process.env['E2E_FIXTURES'] !== '1', 'Requires isolated fixture stack'));

/** Independent expectations from the accepted formulas: advance Q(50% price), house refund Q(50% Q(50% price)). */
const advance = (price: number) => q(price, 2);
const refund = (price: number) => q(q(price * 50, 100) * 50, 100);
const name = (players: Actor[], id: string) => `Player ${players.findIndex(p => p.id === id) + 1}`;
const cellOf = (view: StateView, assetId: string) => view.board!.cells.find(c => c.asset?.assetId === assetId)!;
const owned = (view: StateView, playerId: string) =>
  view.board!.cells.flatMap(c => c.asset && view.owners[c.asset.assetId] === playerId ? [c.asset.assetId] : []);
type Payload = any;

/** The latest public event of `type`, identical on every client. */
function same(players: Actor[], type: string): Payload {
  const event = players[0]!.events.findLast(e => e.event.type === type)?.event;
  expect(event, `${type} reached the clients`).toBeDefined();
  for (const p of players) expect(p.events.findLast(e => e.event.type === type)?.event).toEqual(event);
  return event!.payload;
}
/** Commands go out only inside the saved turn window; screenshots come after it. */
function inWindow(view: StateView, what: string) {
  expect(view.turn!.deadline - Date.now(), `${what} inside the saved turn window`).toBeGreaterThan(3_000);
}
async function sqlRow(sql: string): Promise<unknown[]> {
  const command = process.env['E2E_FIXTURE_SQL_COMMAND'];
  if (!command) throw Error('E2E_FIXTURE_SQL_COMMAND is required for the game_results check');
  const out = execFileSync('sh', ['-c', command], { input: sql, timeout: 25_000, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  return out.split('\n').filter(line => line.trim()).map(line => JSON.parse(line) as unknown);
}

test('stage 5: mortgage, then redeem; rent drops to 0 and comes back', async ({ actors }, info) => {
  const players = await actors(3);
  await load(players, 'mortgage-expiry');
  const owner = await active(players);
  const start = structuredClone(owner.view!);
  const [assetId] = Object.keys(start.mortgages) as [string];
  const cell = cellOf(start, assetId), adv = advance(cell.asset!.price), rent = q(cell.asset!.price * 5, 100);
  expect(start.owners[assetId]).toBe(owner.id);
  expect(start.mortgages[assetId]).toEqual({ advance: adv, lapsCompleted: 7, pending: [owner.id], remainingLaps: 1 });
  await Promise.all(players.map(p => card(p, cell.index)));
  // The clients are checked in parallel to stay well inside the one turn window.
  async function cards(mortgage: string | null, quote: number) {
    await Promise.all(players.map(async p => {
      const c = p.page.locator(sel('asset-card'));
      expect(p.view!.rentQuotes[assetId]).toEqual({ kind: 'fixed', amount: quote });
      await expect(c.locator(sel('asset-owner'))).toHaveText(name(players, owner.id));
      await expect(c.locator(sel('asset-rent'))).toHaveText(money(quote));
      if (mortgage) await expect(c.locator(sel('asset-mortgage'))).toHaveText(mortgage);
      else await expect(c.locator(sel('asset-mortgage'))).toHaveCount(0);
      await expect(c.locator(sel('mortgage-controls'))).toHaveCount(p === owner ? 1 : 0);
    }));
  }
  const projected = (expected: Readonly<Record<string, number>>) => { for (const p of players) expect(p.view!.balances).toEqual(expected); };
  const mortgageButton = owner.page.locator(sel('mortgage')), redeemButton = owner.page.locator(sel('redeem'));
  await cards(`В залоге: получено ${money(adv)}, осталось кругов: 1`, 0);
  await expect(mortgageButton).toBeDisabled();
  await expect(mortgageButton).toHaveText(`Заложить · +${money(adv)}`);
  await expect(owner.page.locator(sel('mortgage-reason'))).toHaveText('Актив уже в залоге.');
  await expect(redeemButton).toBeEnabled();
  await expect(redeemButton).toHaveText(`Выкупить · ${money(adv)}`);

  inWindow(owner.view!, 'redeem');
  await click(players, owner, 'redeem');
  expect(same(players, 'AssetRedeemed')).toEqual({ playerId: owner.id, assetId, amount: adv });
  for (const p of players) expect(p.view!.mortgages).toEqual({});
  projected({ ...start.balances, [owner.id]: start.balances[owner.id]! - adv });
  await cards(null, rent);
  await expect(redeemButton).toBeDisabled();
  await expect(owner.page.locator(sel('redeem-reason'))).toHaveText('Актив не находится в залоге.');
  await expect(mortgageButton).toBeEnabled();

  inWindow(owner.view!, 'mortgage');
  await click(players, owner, 'mortgage');
  expect(same(players, 'AssetMortgaged')).toEqual({ playerId: owner.id, assetId, advance: adv, auto: false });
  await Promise.all(players.map(async p => {
    expect(p.view!.mortgages).toEqual({ [assetId]: { advance: adv, lapsCompleted: 0, pending: start.order, remainingLaps: 8 } });
    await expect(p.page.locator(sel('asset-mortgage-pending'))).toHaveText(start.order!.map(id => name(players, id)).join(', '));
  }));
  projected(start.balances);
  await cards(`В залоге: получено ${money(adv)}, осталось кругов: 8`, 0);
  await expect(mortgageButton).toBeDisabled();

  inWindow(owner.view!, 'second redeem');
  await click(players, owner, 'redeem');
  for (const p of players) expect(p.view!.mortgages).toEqual({});
  await balances(players, { ...start.balances, [owner.id]: start.balances[owner.id]! - adv });
  await cards(null, rent);
  await shoot(players, info, 'mortgage-redeem');
});

test('stage 5: a mortgage expires after its eighth collective lap', async ({ actors }, info) => {
  const players = await actors(3);
  await load(players, 'mortgage-expiry');
  const owner = await active(players);
  const start = structuredClone(owner.view!);
  const [assetId] = Object.keys(start.mortgages) as [string];
  const cell = cellOf(start, assetId), adv = advance(cell.asset!.price);
  // Seven laps are counted in the fixture; the owner is the last player the eighth lap waits for.
  for (const p of players) {
    await card(p, cell.index);
    await expect(p.page.locator(sel('asset-mortgage'))).toHaveText(`В залоге: получено ${money(adv)}, осталось кругов: 1`);
    await expect(p.page.locator(sel('asset-mortgage-pending'))).toHaveText(name(players, owner.id));
    await close(p);
  }
  inWindow(owner.view!, 'final turn of the lap');
  await click(players, owner, 'EndTurn');
  expect(same(players, 'MortgageExpired')).toEqual({ playerId: owner.id, assetId, advance: adv });
  expect(same(players, 'TurnEnded')).toMatchObject({ playerId: owner.id, reason: 'end-turn' });
  for (const p of players) {
    expect(p.view!.mortgages).toEqual({});
    expect(p.view!.owners[assetId]).toBeUndefined();
    expect(p.view!.turn!.playerId).not.toBe(owner.id);
    await card(p, cell.index);
    await expect(p.page.locator(sel('asset-owner'))).toHaveText('свободно');
    await expect(p.page.locator(sel('asset-mortgage'))).toHaveCount(0);
    await expect(p.page.locator(sel('asset-rent'))).toHaveCount(0);
  }
  // The advance stays with the former owner.
  await balances(players, start.balances);
  await shoot(players, info, 'mortgage-expired');
});

const LIQUIDATION: Record<string, [number, string][]> = {
  'liquidation-tier-1': [[1, 'mortgage']],
  'liquidation-tier-2': [[2, 'mortgage']],
  'liquidation-tier-3': [[3, 'sell-house']],
  'liquidation-multi-tier': [[1, 'mortgage'], [3, 'sell-house'], [3, 'mortgage']],
};
for (const [fixture, expectedSteps] of Object.entries(LIQUIDATION)) {
  test(`stage 5: automatic liquidation, then payment — ${fixture}`, async ({ actors }, info) => {
    const players = await actors(3);
    await load(players, fixture);
    const payer = await active(players);
    const before = structuredClone(payer.view!), rent = before.rent!;
    expect(rent.payerId).toBe(payer.id);
    const cash = before.balances[payer.id]!;
    expect(cash).toBeLessThan(rent.amount);
    for (const p of players) {
      await expect(p.page.locator(sel('rent-line'))).toContainText(money(rent.amount));
      await expect(p.page.locator(sel('pay-rent'))).toHaveCount(p === payer ? 1 : 0);
    }
    if (fixture === 'liquidation-multi-tier') {
      // Redeem is refused during one's own open rent; the card says why.
      const mortgaged = Object.keys(before.mortgages).find(id => before.owners[id] === payer.id)!;
      await card(payer, cellOf(before, mortgaged).index);
      await expect(payer.page.locator(sel('redeem'))).toBeDisabled();
      await expect(payer.page.locator(sel('redeem-reason'))).toHaveText('Сначала оплатите ренту.');
      await close(payer);
    }
    inWindow(payer.view!, 'payment');
    await click(players, payer, 'pay-rent');
    const applied = same(players, 'LiquidationApplied');
    const steps = applied.steps as { tier: number; kind: string; assetId: string; amount: number }[];
    expect(steps.map(s => [s.tier, s.kind])).toEqual(expectedSteps);
    const houses: Record<string, number> = { ...before.houses };
    for (const s of steps) {
      expect(before.owners[s.assetId]).toBe(payer.id);
      const price = cellOf(before, s.assetId).asset!.price;
      expect(s.amount).toBe(s.kind === 'mortgage' ? advance(price) : refund(price));
      if (s.kind === 'sell-house' && !--houses[s.assetId]!) delete houses[s.assetId];
    }
    if (fixture === 'liquidation-multi-tier') {
      // A house sold, then the bare asset mortgaged.
      expect(steps[1]!.assetId).toBe(steps[2]!.assetId);
      expect(before.houses[steps[1]!.assetId]).toBe(1);
    }
    const raised = steps.reduce((n, s) => n + s.amount, 0);
    expect(applied).toEqual({ payerId: payer.id, creditorId: rent.ownerId, debt: rent.amount, cashBefore: cash, raised, steps });
    expect(cash + raised).toBeGreaterThanOrEqual(rent.amount);
    expect(same(players, 'RentPaid')).toEqual({ payerId: payer.id, ownerId: rent.ownerId, assetId: rent.assetId, amount: rent.amount, auto: false });
    for (const p of players) {
      const update = p.events.filter(e => e.revision === p.view!.revision).map(e => e.event.type);
      expect(update.indexOf('LiquidationApplied')).toBeGreaterThanOrEqual(0);
      expect(update.indexOf('LiquidationApplied')).toBeLessThan(update.indexOf('RentPaid'));
      expect(p.view!.rent).toBeNull();
      expect(p.view!.eliminated).toEqual(before.eliminated);
      expect(p.view!.houses).toEqual(houses);
      for (const s of steps.filter(s => s.kind === 'mortgage')) {
        expect(p.view!.mortgages[s.assetId]).toEqual({ advance: s.amount, lapsCompleted: 0, pending: before.order, remainingLaps: 8 });
        expect(p.events.find(e => e.event.type === 'AssetMortgaged' && (e.event.payload as Payload).assetId === s.assetId)!.event.payload)
          .toEqual({ playerId: payer.id, assetId: s.assetId, advance: s.amount, auto: true });
      }
      const notice = p.page.locator(sel('debt-notices')).locator(sel('liquidation')).last();
      await expect(notice.locator(sel('liquidation-debt'))).toHaveText(`Долг игроку ${name(players, rent.ownerId)}: ${money(rent.amount)}.`);
      await expect(notice.locator(sel('liquidation-step'))).toHaveText(steps.map(s =>
        `Этап ${s.tier}: ${s.kind === 'mortgage' ? 'заложен актив' : 'продан дом на активе'} «${cellOf(before, s.assetId).asset!.name}», +${money(s.amount)}`));
      await expect(notice.locator(sel('liquidation-total'))).toHaveText(`Собрано ${money(raised)}. Оплачено ${money(rent.amount)}.`);
      await expect(p.page.locator(sel('rent'))).toHaveCount(0);
    }
    await balances(players, { ...before.balances, [payer.id]: cash + raised - rent.amount, [rent.ownerId]: before.balances[rent.ownerId]! + rent.amount });
    info.annotations.push({ type: 'liquidation-steps', description: steps.map(s => `T${s.tier} ${s.kind} +${s.amount}`).join(', ') });
    await shoot(players, info, fixture);
  });
}

test('stage 5: bankruptcy to a player creditor; the bankrupt client keeps watching', async ({ actors }, info) => {
  const players = await actors(3);
  await load(players, 'bankruptcy-houses');
  const payer = await active(players);
  const before = structuredClone(payer.view!), rent = before.rent!;
  const creditor = players.find(p => p.id === rent.ownerId)!;
  const portfolio = owned(before, payer.id);
  const built = Object.keys(before.houses).find(id => before.owners[id] === payer.id)!;
  const builtCell = cellOf(before, built);
  const mortgaged = Object.keys(before.mortgages).find(id => before.owners[id] === payer.id)!;
  await card(payer, cellOf(before, mortgaged).index);
  await expect(payer.page.locator(sel('redeem'))).toBeDisabled();
  await expect(payer.page.locator(sel('redeem-reason'))).toHaveText('Сначала оплатите ренту.');
  await close(payer);
  for (const p of players) await card(p, builtCell.index);
  // Asset inspection is dismissible so the required rent response remains reachable.
  for (const p of players) await close(p);

  inWindow(payer.view!, 'payment');
  await click(players, payer, 'pay-rent');
  const paid = before.balances[payer.id]! + refund(builtCell.asset!.price);
  expect(paid).toBeLessThan(rent.amount);
  expect(same(players, 'HouseSold')).toEqual({ playerId: payer.id, assetId: built, houses: 0, refund: refund(builtCell.asset!.price), auto: true });
  expect(same(players, 'PlayerBankrupt')).toEqual({ playerId: payer.id, creditorId: creditor.id, debt: rent.amount, paid, writtenOff: rent.amount - paid });
  expect(same(players, 'AssetsReleased')).toEqual({ playerId: payer.id, assetIds: portfolio, reason: 'bankrupt' });
  for (const p of players) {
    expect(p.events.some(e => e.event.type === 'RentPaid')).toBe(false);
    expect(p.view!.rent).toBeNull();
    expect(p.view!.order).not.toContain(payer.id);
    expect(p.view!.eliminations).toEqual([expect.objectContaining({ playerId: payer.id, reason: 'bankrupt', creditorId: creditor.id })]);
    for (const id of portfolio) {
      expect(p.view!.owners[id]).toBeUndefined();
      expect(p.view!.houses[id]).toBeUndefined();
      expect(p.view!.mortgages[id]).toBeUndefined();
    }
    const notice = p.page.locator(sel('debt-notices')).locator(sel('bankruptcy')).last();
    await expect(notice.locator(sel('bankruptcy-amounts'))).toHaveText(
      `Долг игроку ${name(players, creditor.id)}: ${money(rent.amount)}. Оплачено ${money(paid)}, списано ${money(rent.amount - paid)}.`);
    await expect(notice.locator(sel('bankruptcy-assets'))).toHaveText(
      `Освобождены активы: ${portfolio.map(id => cellOf(before, id).asset!.name).join(', ')}`);
    if (p === payer) await expect(p.page.locator(sel('spectator'))).toHaveText('Вы обанкротились и теперь наблюдаете за партией.');
    else await expect(p.page.locator(sel('spectator'))).toHaveCount(0);
  }
  await balances(players, { ...before.balances, [payer.id]: 0, [creditor.id]: before.balances[creditor.id]! + paid });
  await shoot(players, info, 'bankruptcy');
  await payer.page.locator(sel('continue-watching')).click();
  for (const p of players) {
    await card(p, builtCell.index);
    await expect(p.page.locator(sel('asset-owner'))).toHaveText('свободно');
    await expect(p.page.locator(sel('asset-houses'))).toHaveText('0 / 4');
    await expect(p.page.locator(sel('asset-mortgage'))).toHaveCount(0);
  }
  await shoot(players, info, 'bankruptcy-assets-released');
  for (const p of players) await close(p);

  // The game goes on for the others, and the bankrupt client keeps receiving it.
  const next = await active(players);
  expect(next).not.toBe(payer);
  expect(next.view!.turn!.rolled).toBe(false);
  inWindow(next.view!, 'next roll');
  await click(players, next, 'RollDice');
  same(players, 'DiceRolled');
  await expect(payer.page.locator(sel('RollDice'))).toBeDisabled();
  await expect(payer.page.locator(sel('spectator'))).toBeVisible();
  await payer.page.locator(sel('chat-input')).fill('Chat from bankrupt spectator');
  await payer.page.locator(sel('chat-send')).click();
  for (const recipient of players) {
    await expect(recipient.page.locator(sel('journal-entry')).filter({ hasText: 'Chat from bankrupt spectator' })).toBeVisible();
    await expect.poll(() => recipient.chats.some(message => message.text === 'Chat from bankrupt spectator' && message.authorId === payer.id)).toBe(true);
  }
  const welcomeCount = payer.welcomes.length;
  await payer.page.reload();
  await expect(payer.page.locator(sel('board-canvas'))).toBeVisible();
  await expect.poll(() => payer.welcomes.length).toBeGreaterThan(welcomeCount);
  await expect(payer.page.locator(sel('journal-entry')).filter({ hasText: 'Chat from bankrupt spectator' })).toBeVisible();
  await shoot(players, info, 'bankrupt-watching');
});

test('stage 5: resignation frees the resigned player\'s assets on every client', async ({ actors }, info) => {
  const players = await actors(3);
  await load(players, 'liquidation-tier-3');
  const payer = await active(players);
  const before = structuredClone(payer.view!);
  const portfolio = owned(before, payer.id);
  expect(portfolio.every(id => before.houses[id] === 1)).toBe(true);
  const first = cellOf(before, portfolio[0]!);
  for (const p of players) {
    await card(p, first.index);
    await expect(p.page.locator(sel('asset-owner'))).toHaveText(name(players, payer.id));
    await expect(p.page.locator(sel('asset-houses'))).toHaveText('1 / 4');
    await close(p);
  }
  await resign(payer);
  await expect.poll(() => players.map(p => p.view!.revision), fast).toEqual(players.map(() => payer.view!.revision));
  expect(same(players, 'PlayerResigned')).toEqual({ playerId: payer.id });
  expect(same(players, 'AssetsReleased')).toEqual({ playerId: payer.id, assetIds: portfolio, reason: 'resigned' });
  for (const p of players) {
    expect(p.view!.rent).toBeNull();
    expect(p.events.some(e => e.event.type === 'RentPaid')).toBe(false);
    expect(p.view!.eliminations).toEqual([expect.objectContaining({ playerId: payer.id, reason: 'resigned', creditorId: null })]);
    if (p.view!.eliminated.some(id => id === p.id)) await p.page.keyboard.press('Escape');
    for (const id of portfolio) {
      expect(p.view!.owners[id]).toBeUndefined();
      expect(p.view!.houses[id]).toBeUndefined();
    }
    await card(p, first.index);
    await expect(p.page.locator(sel('asset-owner'))).toHaveText('свободно');
    await expect(p.page.locator(sel('asset-houses'))).toHaveText('0 / 4');
    await expect(p.page.locator(sel('rent'))).toHaveCount(0);
    if (p === payer) await expect(p.page.locator(sel('spectator'))).toHaveText('Вы сдались и теперь наблюдаете за партией.');
  }
  await balances(players, before.balances);
  await shoot(players, info, 'resigned');
});

test('stage 5: the game reaches a winner; the result survives a reload and matches game_results', async ({ actors }, info) => {
  const players = await actors(3);
  const roomId = await load(players, 'final-bankruptcy');
  const payer = await active(players);
  const before = structuredClone(payer.view!), rent = before.rent!;
  const creditor = players.find(p => p.id === rent.ownerId)!;
  const resigned = players.find(p => (before.eliminated as readonly string[]).includes(p.id))!;
  expect(before.order).toHaveLength(2);
  await expect(resigned.page.locator(sel('spectator'))).toHaveText('Вы сдались и теперь наблюдаете за партией.');
  inWindow(payer.view!, 'final payment');
  await click(players, payer, 'pay-rent');
  const ended = same(players, 'GameEnded');
  expect(same(players, 'PlayerBankrupt')).toMatchObject({ playerId: payer.id, creditorId: creditor.id, paid: before.balances[payer.id] });
  expect(ended.winner).toBe(creditor.id);
  expect(ended.eliminations.map((e: Payload) => [e.playerId, e.reason])).toEqual([[resigned.id, 'resigned'], [payer.id, 'bankrupt']]);
  const result = { winner: creditor.id, finishedAt: ended.at, eliminations: ended.eliminations, finalBalances: ended.finalBalances };
  const lines = {
    eliminations: [new RegExp(`^${name(players, resigned.id)}: сдача, \\d{2}\\.`), new RegExp(`^${name(players, payer.id)}: банкротство, \\d{2}\\.`)],
    balances: players.map((p, i) => `Player ${i + 1}: ${money(ended.finalBalances[p.id])}`),
  };
  async function gameOver() {
    for (const p of players) {
      expect(p.view!.phase).toBe('finished');
      expect(p.view!.result).toEqual(result);
      await expect(p.page.locator(sel('screen-finished'))).toBeVisible();
      await expect(p.page.locator(sel('winner'))).toHaveText(`Победитель: ${name(players, creditor.id)}`);
      await expect(p.page.locator(sel('elimination-row'))).toHaveText(lines.eliminations);
      await expect(p.page.locator(sel('final-balance-row'))).toHaveText(lines.balances);
      const spectator = p.page.locator(sel('spectator'));
      if (p === creditor) await expect(spectator).toHaveCount(0);
      else await expect(spectator).toHaveText(p === payer ? 'Вы выбыли из-за банкротства.' : 'Вы выбыли: вы сдались.');
    }
  }
  await gameOver();
  await shoot(players, info, 'game-over');
  for (const p of players) {
    const welcomes = p.welcomes.length;
    p.view = null;
    await p.page.reload();
    await expect.poll(() => p.welcomes.length, fast).toBeGreaterThan(welcomes);
  }
  await gameOver();
  await shoot(players, info, 'game-over-reloaded');

  expect(roomId).toMatch(/^r_[A-Za-z0-9_-]+$/);
  const rows = await sqlRow(`SELECT row_to_json(r) FROM (SELECT room_id, rules_version, winner_id,
    (extract(epoch FROM finished_at) * 1000)::bigint AS finished_at, final_revision, eliminations, final_balances
    FROM game_results WHERE room_id = '${roomId}') r;`);
  expect(rows).toEqual([{ room_id: roomId, rules_version: before.rulesVersion, winner_id: creditor.id, finished_at: result.finishedAt,
    final_revision: players[0]!.view!.revision, eliminations: result.eliminations, final_balances: result.finalBalances }]);
  await info.attach('game-results-row', { body: JSON.stringify(rows, null, 2), contentType: 'application/json' });
});

test('stage 5: a server restart keeps mortgages and terms; the next boundary still counts', async ({ actors }, info) => {
  const players = await actors(3);
  await load(players, 'mortgage-restart');
  const payer = await active(players);
  const before = structuredClone(payer.view!);
  const expiring = Object.keys(before.mortgages).find(id => before.owners[id] === payer.id)!;
  const later = Object.keys(before.mortgages).find(id => id !== expiring)!;
  expect(before.mortgages[expiring]).toMatchObject({ lapsCompleted: 7, pending: [payer.id], remainingLaps: 1 });
  expect(before.mortgages[later]).toMatchObject({ lapsCompleted: 3, pending: before.order, remainingLaps: 5 });
  const expiringCell = cellOf(before, expiring), laterCell = cellOf(before, later);
  for (const p of players) await card(p, expiringCell.index);

  const counts = players.map(p => p.welcomes.length);
  const command = process.env['E2E_FIXTURE_RESTART_COMMAND'];
  if (!command) throw Error('E2E_FIXTURE_RESTART_COMMAND is required for isolated restart evidence');
  execFileSync('sh', ['-c', command], { timeout: 25_000, stdio: 'pipe' });
  for (const [i, p] of players.entries()) {
    await expect.poll(() => p.welcomes.length, fast).toBeGreaterThan(counts[i]!);
    expect(p.view!.revision).toBe(before.revision);
    expect(p.view!.mortgages).toEqual(before.mortgages);
    expect(p.view!.owners).toEqual(before.owners);
    expect(p.view!.turn).toEqual(before.turn);
    expect(p.view!.balances).toEqual(before.balances);
    await expect(p.page.locator(sel('asset-mortgage'))).toHaveText(`В залоге: получено ${money(before.mortgages[expiring]!.advance)}, осталось кругов: 1`);
    await expect(p.page.locator(sel('asset-mortgage-pending'))).toHaveText(name(players, payer.id));
  }
  for (const p of players) await close(p);
  inWindow(payer.view!, 'restart completed and the boundary turn');
  await click(players, payer, 'EndTurn');
  expect(same(players, 'MortgageExpired')).toEqual({ playerId: payer.id, assetId: expiring, advance: before.mortgages[expiring]!.advance });
  const remaining = before.order!.filter(id => id !== payer.id);
  for (const p of players) {
    expect(p.view!.mortgages).toEqual({ [later]: { ...before.mortgages[later]!, pending: remaining } });
    expect(p.view!.owners[expiring]).toBeUndefined();
    await card(p, expiringCell.index);
    await expect(p.page.locator(sel('asset-owner'))).toHaveText('свободно');
    await close(p);
    await card(p, laterCell.index);
    await expect(p.page.locator(sel('asset-mortgage'))).toHaveText(`В залоге: получено ${money(before.mortgages[later]!.advance)}, осталось кругов: 5`);
    await expect(p.page.locator(sel('asset-mortgage-pending'))).toHaveText(remaining.map(id => name(players, id)).join(', '));
  }
  await shoot(players, info, 'restart-boundary');
});
