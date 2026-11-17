import { execFileSync } from 'node:child_process';
import type { TestInfo } from '@playwright/test';
import { cellRect } from '../apps/client/src/board/layout';
import { test, expect, sel, active, type Actor } from './helpers';

// Explicit opt-in: earlier stages always run against their original stacks.
test.beforeEach(() => test.skip(process.env['E2E_FIXTURES'] !== '1', 'Requires isolated fixture stack'));
const fast = { intervals: [20] };
const q = (numerator: number, denominator: number) => 10 * Math.floor(numerator / (10 * denominator));

async function sync(players: Actor[], revision: number) {
  for (const p of players) await expect.poll(() => p.view?.revision, fast).toBe(revision);
}
async function click(players: Actor[], actor: Actor, selector: string) {
  const before = actor.view!.revision;
  await actor.page.locator(sel(selector)).click();
  await expect.poll(() => actor.view?.revision, fast).toBeGreaterThan(before);
  await sync(players, actor.view!.revision);
}

/** Tokens stay inside test context and the existing trace sanitizer. No runtime state injection. */
async function load(players: Actor[], fixture: string) {
  const tokens = await Promise.all(players.map(p => p.page.evaluate(() => JSON.parse(localStorage.getItem('game.guest')!).token as string)));
  const response = await players[0]!.page.request.post('/api/test/fixtures', { data: { fixture, tokens } });
  expect(response.status()).toBe(201);
  const { roomId } = await response.json() as { roomId: string };
  await Promise.all(players.map(async p => {
    await p.page.evaluate(async roomId => {
      const guest = JSON.parse(localStorage.getItem('game.guest')!);
      const r = await fetch(`/api/rooms/${roomId}`, { headers: { Authorization: `Bearer ${guest.token}` } });
      if (!r.ok) throw Error(`fixture room lookup: ${r.status}`);
      const { room } = await r.json();
      localStorage.setItem('game.room', JSON.stringify(room));
    }, roomId);
    p.view = null; p.events = [];
    const welcomes = p.welcomes.length;
    await p.page.reload();
    await expect.poll(() => p.welcomes.length, fast).toBeGreaterThan(welcomes);
    await expect(p.page.locator('[data-screen="game"]')).toBeVisible();
  }));
  await sync(players, players[0]!.view!.revision);
}
async function shoot(players: Actor[], info: TestInfo, name: string) {
  for (const [i, p] of players.entries()) {
    const path = info.outputPath(`${name}-${i}.png`);
    await p.page.screenshot({ path, fullPage: true });
    await info.attach(`${name}-${i}`, { path, contentType: 'image/png' });
  }
}
async function balances(players: Actor[], expected: Readonly<Record<string, number>>) {
  for (const p of players) {
    expect(p.view!.balances).toEqual(expected);
    for (const [i, other] of players.entries()) {
      const row = p.page.locator(sel('player-balance')).filter({ has: p.page.getByText(`Player ${i + 1}`, { exact: true }) });
      await expect(row.locator('span').first()).toHaveText(String(expected[other.id]));
    }
  }
}
async function card(p: Actor, cell: number) {
  const canvas = p.page.locator(sel('board')).locator('canvas');
  const box = (await canvas.boundingBox())!;
  const rect = cellRect(cell, box.width);
  await canvas.click({ position: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } });
  await expect(p.page.locator(sel('asset-card'))).toBeVisible();
}
async function close(p: Actor) {
  await p.page.getByRole('button', { name: 'Close asset card' }).click();
}
/** Dispatch the disabled control through its real Vue handler and client queue.
 * This bypasses only the DOM guard: the real server rejection must travel back
 * through the normal pending-command/Ack mapping to the visible reason. */
async function rejectedBuild(players: Actor[], actor: Actor, assetId: string, code: string) {
  const before = structuredClone(actor.view!);
  const name = before.board!.cells.find(c => c.asset?.assetId === assetId)!.asset!.name;
  await expect(actor.page.locator(sel('asset-card')).getByRole('heading', { level: 2 })).toHaveText(name);
  const count = actor.acks.length;
  await actor.page.locator(sel('build-house')).evaluate(button => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await expect.poll(() => actor.acks.slice(count).find(a => a.error?.code === code), fast).toMatchObject({ outcome: 'rejected', revision: before.revision, error: { code } });
  await expect(actor.page.locator(sel('message')).filter({ hasText: code })).toBeVisible();
  for (const p of players) {
    expect(p.view!.revision).toBe(before.revision);
    expect(p.view!.houses).toEqual(before.houses);
    expect(p.view!.balances).toEqual(before.balances);
  }
}

/** Fresh genesis on a miss; no fabricated rolls and no long random walk. */
async function landing(players: Actor[], fixture: string, own = false) {
  for (let attempt = 1; attempt <= 100; attempt++) {
    await load(players, `pre-roll-${fixture}`);
    const mover = await active(players);
    const before = structuredClone(mover.view!);
    expect(before.turn!.rolled).toBe(false);
    expect(before.rent).toBeNull();
    await click(players, mover, 'RollDice');
    const rolled = mover.events.findLast(e => e.event.type === 'DiceRolled')!;
    const dice = (rolled.event.payload as { dice: number[] }).dice;
    const sum = dice.reduce((a, b) => a + b, 0);
    for (const p of players) {
      expect(p.events.findLast(e => e.event.type === 'DiceRolled')!.event).toEqual(rolled.event);
      expect(p.view!.positions[mover.id]).toBe((before.positions[mover.id]! + sum) % 40);
    }
    const view = mover.view!;
    const cell = view.board!.cells[view.positions[mover.id]!]!;
    if (own ? !!cell.asset : !!view.rent && (fixture !== 'shortfall' || view.balances[mover.id]! < view.rent.amount)) {
      return { mover, sum, cell, attempt };
    }
  }
  throw Error(`${fixture}: target not reached in 100 real rolls`);
}

for (const fixture of ['regular-rent', 'full-group-rent', 'logistics-rent', 'energy-rent', 'shortfall']) {
  test(`stage 4: real landing and payment — ${fixture}`, async ({ actors }, info) => {
    test.setTimeout(300_000);
    const players = await actors(3);
    const { mover, sum, cell, attempt } = await landing(players, fixture);
    info.annotations.push({ type: 'real-roll-attempts', description: String(attempt) });
    const view = structuredClone(mover.view!), rent = view.rent!, asset = cell.asset!;
    expect(view.houses).toEqual({});
    const group = view.board!.cells.filter(c => c.asset?.groupId === asset.groupId);
    const h = group.filter(c => view.owners[c.asset!.assetId] === rent.ownerId).length;
    const expected = fixture === 'energy-rent'
      ? q(group.reduce((n, c) => n + c.asset!.price, 0) * sum * h, 200 * group.length)
      : fixture === 'logistics-rent' ? q(asset.price * 10, 100)
      : q(asset.price * 5, 100) * (fixture === 'full-group-rent' ? 2 : 1);
    expect(rent.amount).toBe(expected);
    if (fixture === 'logistics-rent') expect(h).toBe(2);
    if (fixture === 'full-group-rent') expect(h).toBe(group.length);
    if (fixture === 'regular-rent') expect(h).toBeLessThan(group.length);
    const due = mover.events.findLast(e => e.event.type === 'RentDue')!.event;
    for (const p of players) {
      expect(p.view!.rent).toEqual(rent);
      expect(p.events.findLast(e => e.event.type === 'RentDue')!.event).toEqual(due);
      await expect(p.page.locator(sel('rent-line'))).toContainText(String(expected));
      await expect(p.page.locator(sel('pay-rent'))).toHaveCount(p === mover ? 1 : 0);
      if (fixture === 'energy-rent') {
        expect(rent.diceSum).toBe(sum);
        await expect(p.page.locator(sel('rent-line'))).toContainText(`dice sum ${sum}`);
      }
    }
    expect(view.turn!.deadline - Date.now(), 'rent is still inside its saved turn window').toBeGreaterThan(2_000);
    await shoot(players, info, `${fixture}-due`);
    await click(players, mover, 'pay-rent');
    const paid = Math.min(rent.amount, view.balances[mover.id]!);
    const expectedBalances = { ...view.balances, [mover.id]: view.balances[mover.id]! - paid, [rent.ownerId]: view.balances[rent.ownerId]! + paid };
    if (fixture === 'shortfall') {
      expect(paid).toBeGreaterThan(0); expect(paid).toBeLessThan(rent.amount);
      const owned = Object.keys(view.owners).filter(id => view.owners[id] === mover.id);
      for (const p of players) {
        expect(p.view!.balances).toEqual(expectedBalances);
        expect(p.view!.rent).toBeNull();
        expect(p.events.findLast(e => e.event.type === 'PlayerBankrupt')!.event.payload).toEqual({
          playerId: mover.id, creditorId: rent.ownerId, debt: rent.amount, paid, writtenOff: rent.amount - paid,
        });
        expect(p.view!.eliminations.find(e => e.playerId === mover.id)).toMatchObject({ playerId: mover.id, reason: 'bankrupt', creditorId: rent.ownerId });
        expect(p.view!.order).not.toContain(mover.id);
        expect(Object.values(p.view!.owners)).not.toContain(mover.id);
        for (const id of owned) {
          expect(p.view!.owners[id]).toBeUndefined();
          expect(p.view!.houses[id]).toBeUndefined();
          expect(p.view!.mortgages[id]).toBeUndefined();
        }
        expect(p.events.some(e => e.event.type === 'RentPaid')).toBe(false);
      }
    } else {
      await balances(players, expectedBalances);
      for (const p of players) {
        expect(p.view!.rent).toBeNull();
        expect(p.events.findLast(e => e.event.type === 'RentPaid')!.event.payload).toEqual({
          payerId: mover.id, ownerId: rent.ownerId, assetId: rent.assetId, amount: rent.amount, auto: false,
        });
        await expect(p.page.locator(sel('rent'))).toHaveCount(0);
      }
    }
    await shoot(players, info, fixture);
  });
}

test('stage 4: landing on own asset opens no decision', async ({ actors }, info) => {
  test.setTimeout(300_000);
  const players = await actors(3);
  const { mover, cell } = await landing(players, 'own-asset', true);
  for (const p of players) {
    expect(p.view!.owners[cell.asset!.assetId]).toBe(mover.id);
    expect(p.view!.rent).toBeNull(); expect(p.view!.purchase).toBeNull(); expect(p.view!.auction).toBeNull();
    expect(p.events.some(e => e.event.type === 'RentDue')).toBe(false);
    await expect(p.page.locator(sel('rent'))).toHaveCount(0);
    await expect(p.page.locator(sel('purchase'))).toHaveCount(0);
    await expect(p.page.locator(sel('auction'))).toHaveCount(0);
  }
  await shoot(players, info, 'own-asset');
});

test('stage 4: even building, quota, real double bonus turn and selling', async ({ actors }, info) => {
  test.setTimeout(300_000);
  const players = await actors(3);
  // Retry real pre-roll genesis until an actual double, then build within that turn.
  let owner: Actor | undefined;
  let firstCell = 0, secondCell = 0, firstId = '', secondId = '';
  for (let attempt = 1; attempt <= 100; attempt++) {
    await load(players, 'bonus-building');
    owner = await active(players);
    const first = owner.view!.board!.cells.find(c => c.kind === 'monopoly')!;
    const second = owner.view!.board!.cells.find(c => c.index !== first.index && c.asset?.groupId === first.asset!.groupId)!;
    firstCell = first.index; secondCell = second.index; firstId = first.asset!.assetId; secondId = second.asset!.assetId;
    await click(players, owner, 'RollDice');
    const roll = owner.events.findLast(e => e.event.type === 'DiceRolled')!.event;
    const dice = (roll.payload as { dice: number[] }).dice;
    if (dice[0] === dice[1]) {
      for (const p of players) expect(p.events.findLast(e => e.event.type === 'DiceRolled')!.event).toEqual(roll);
      info.annotations.push({ type: 'double-attempts', description: String(attempt) });
      break;
    }
    owner = undefined;
  }
  expect(owner, 'no real double in 100 attempts').toBeDefined();
  const mover = owner!;
  const before = structuredClone(mover.view!);
  const cost = q(before.board!.cells[firstCell]!.asset!.price * 50, 100);
  await card(mover, firstCell);
  await click(players, mover, 'build-house');
  await balances(players, { ...before.balances, [mover.id]: before.balances[mover.id]! - cost });
  for (const p of players) {
    expect(p.view!.houses[firstId]).toBe(1); expect(p.view!.turn!.quotas.builds).toBe(0);
    expect(p.events.findLast(e => e.event.type === 'HouseBuilt')!.event.payload).toEqual({ playerId: mover.id, assetId: firstId, houses: 1, cost });
  }
  await close(mover);
  await card(mover, secondCell);
  await expect(mover.page.locator(sel('build-house'))).toBeDisabled();
  await expect(mover.page.locator(sel('build-reason'))).toHaveText('You have already built a house this turn.');
  await rejectedBuild(players, mover, secondId, 'BUILD_QUOTA_USED');
  await expect(mover.page.locator(sel('message')).filter({ hasText: 'BUILD_QUOTA_USED' })).toContainText('You have already built a house this turn.');
  await close(mover);
  const turn = mover.view!.turn!.turnId;
  await click(players, mover, 'EndTurn');
  for (const p of players) {
    expect(p.view!.turn).toMatchObject({ playerId: mover.id, bonus: true, rolled: false, quotas: { builds: 1 } });
    expect(p.view!.turn!.turnId).not.toBe(turn);
  }
  // Fresh quota, but unevenness still forbids building twice on the same asset.
  await card(mover, firstCell);
  await expect(mover.page.locator(sel('build-house'))).toBeDisabled();
  await expect(mover.page.locator(sel('build-reason'))).toHaveText('Build evenly: another asset of the group has fewer houses.');
  await rejectedBuild(players, mover, firstId, 'UNEVEN_BUILD');
  await expect(mover.page.locator(sel('message')).filter({ hasText: 'UNEVEN_BUILD' })).toContainText('Build evenly');
  await close(mover);
  await card(mover, secondCell);
  await expect(mover.page.locator(sel('build-house'))).toBeEnabled();
  const beforeBuild = structuredClone(mover.view!);
  const secondPrice = beforeBuild.board!.cells[secondCell]!.asset!.price;
  await click(players, mover, 'build-house');
  await balances(players, { ...beforeBuild.balances, [mover.id]: beforeBuild.balances[mover.id]! - q(secondPrice * 50, 100) });
  await close(mover);
  const beforeSale = structuredClone(mover.view!);
  const refund = q(q(beforeSale.board!.cells[firstCell]!.asset!.price * 50, 100) * 50, 100);
  await card(mover, firstCell);
  await click(players, mover, 'sell-house');
  await close(mover);
  await balances(players, { ...beforeSale.balances, [mover.id]: beforeSale.balances[mover.id]! + refund });
  for (const p of players) {
    expect(p.view!.houses[firstId]).toBeUndefined(); expect(p.view!.houses[secondId]).toBe(1);
    expect(p.events.findLast(e => e.event.type === 'HouseSold')!.event.payload).toEqual({ playerId: mover.id, assetId: firstId, houses: 0, refund, auto: false });
    await card(p, firstCell);
    await expect(p.page.locator(sel('asset-houses'))).toHaveText('0 / 4'); await close(p);
    await card(p, secondCell);
    await expect(p.page.locator(sel('asset-houses'))).toHaveText('1 / 4');
  }
  await shoot(players, info, 'bonus-build-sale');
});

test('stage 4: reload and server restart preserve open rent; real deadline auto-pays', async ({ actors }, info) => {
  test.setTimeout(120_000);
  const players = await actors(3);
  await load(players, 'open-rent');
  const payer = await active(players), before = structuredClone(payer.view!), rent = before.rent!;
  const reloaded = players[1]!, welcomes = reloaded.welcomes.length;
  await reloaded.page.reload();
  await expect.poll(() => reloaded.welcomes.length, fast).toBeGreaterThan(welcomes);
  expect(reloaded.view!.rent).toEqual(rent); expect(reloaded.view!.turn).toEqual(before.turn);
  const counts = players.map(p => p.welcomes.length);
  const command = process.env['E2E_FIXTURE_RESTART_COMMAND'];
  if (!command) throw Error('E2E_FIXTURE_RESTART_COMMAND is required for isolated restart evidence');
  execFileSync('sh', ['-c', command], { timeout: 25_000, stdio: 'pipe' });
  for (const [i, p] of players.entries()) {
    await expect.poll(() => p.welcomes.length, fast).toBeGreaterThan(counts[i]!);
    expect(p.view!.revision).toBe(before.revision);
    expect(p.view!.rent).toEqual(rent); expect(p.view!.turn).toEqual(before.turn);
    expect(p.view!.houses).toEqual(before.houses); expect(p.view!.balances).toEqual(before.balances);
    await expect(p.page.locator(sel('rent'))).toBeVisible();
  }
  expect(before.turn!.deadline - Date.now(), 'restart completed before rent deadline').toBeGreaterThan(2_000);
  await shoot(players, info, 'restored-open-rent');
  for (const p of players) {
    await expect.poll(() => p.events.findLast(e => e.event.type === 'RentPaid'), { timeout: 60_000, intervals: [50] }).toBeDefined();
    const paid = p.events.findLast(e => e.event.type === 'RentPaid')!;
    expect(paid.at).toBeGreaterThanOrEqual(before.turn!.deadline);
    expect(paid.at - before.turn!.deadline).toBeLessThan(2_000);
    expect(paid.event.payload).toEqual({ payerId: rent.payerId, ownerId: rent.ownerId, assetId: rent.assetId, amount: rent.amount, auto: true });
    expect(p.view!.rent).toBeNull(); expect(p.view!.turn!.turnId).not.toBe(before.turn!.turnId);
    await expect(p.page.locator(sel('rent'))).toHaveCount(0);
  }
  await balances(players, { ...before.balances, [rent.payerId]: before.balances[rent.payerId]! - rent.amount, [rent.ownerId]: before.balances[rent.ownerId]! + rent.amount });
  await shoot(players, info, 'deadline-paid');
});
