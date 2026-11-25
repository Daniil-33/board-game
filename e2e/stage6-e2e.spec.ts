import type { GameEvent } from '../packages/game-core/src/index';
import { test, expect, sel, active, captureScreens, type Actor } from './helpers';
import { load, click, card, close, fast, balances } from './fixture-helpers';

test.beforeEach(() => test.skip(process.env['E2E_FIXTURES'] !== '1', 'Requires isolated deterministic fixture stack'));

function eventSeenByAll(players: Actor[], type: string): GameEvent {
  const found = players.map(player => player.events.findLast(entry => entry.event.type === type)?.event);
  expect(found[0], `${type} emitted`).toBeDefined();
  for (const event of found) expect(event).toEqual(found[0]);
  return found[0]!;
}

test('S3 a double landing on cell 30 sends the player to jail without a bonus', async ({ actors }) => {
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
});


test('S1 casino win and loss are public and settle balances for all three clients', async ({ actors }) => {
  const players = await actors(3);
  const outcomes = new Set<boolean>();
  for (let attempt = 0; attempt < 30 && outcomes.size < 2; attempt++) {
    await load(players, 'casino-decision');
    const gambler = await active(players);
    const before = { ...gambler.view!.balances };
    await expect(gambler.page.locator(sel('casino-panel'))).toBeVisible();
    if (attempt === 0) await captureScreens(gambler.page, 'casino-dialog');
    await click(players, gambler, 'casino-bet');
    const resolved = eventSeenByAll(players, 'CasinoResolved');
    const payload = resolved.payload as { playerId: string; amount: number; won: boolean; balance: number };
    expect(payload.playerId).toBe(gambler.id);
    expect(payload.amount).toBe(10);
    outcomes.add(payload.won);
    const expected = { ...before, [gambler.id]: before[gambler.id]! + (payload.won ? 10 : -10) };
    await balances(players, expected);
    for (const player of players) {
      await expect(player.page.locator(sel('special-event-reveal'))).toContainText(payload.won ? 'Выигрыш' : 'Проигрыш');
    }
  }
  expect(outcomes).toEqual(new Set([true, false]));
});

test('S2 chance gain and loss; a negative card is paid through automatic liquidation', async ({ actors }) => {
  const players = await actors(3);
  const cards = new Set<string>();
  let captured = false;
  // Seed 129, after S1 in the stage-6 job, yields the two card kinds within
  // four fresh pre-roll fixtures (two misses, then loss and gain).
  for (let attempt = 0; attempt < 4 && (!cards.has('gain') || !cards.has('loss')); attempt++) {
    await load(players, 'chance-liquidation');
    const actor = await active(players);
    const before = { ...actor.view!.balances };
    await click(players, actor, 'RollDice');
    const drawn = actor.events.findLast(entry => entry.event.type === 'ChanceDrawn')?.event;
    if (!drawn) continue;
    for (const player of players) expect(player.events.findLast(entry => entry.event.type === 'ChanceDrawn')?.event).toEqual(drawn);
    const cardKind = (drawn.payload as { card: string }).card;
    if (cardKind.startsWith('gain-')) {
      cards.add('gain');
      const amount = (drawn.payload as { amount: number }).amount;
      const expected = { ...before, [actor.id]: before[actor.id]! + amount };
      expect(actor.view!.balances[actor.id]).toBe(expected[actor.id]);
      await balances(players, expected);
      for (const player of players) await expect(player.page.locator(sel('special-event-reveal'))).toContainText('капитала');
    } else {
      cards.add('loss');
      expect(actor.view!.charge?.payerId).toBe(actor.id);
      await expect(actor.page.locator(sel('special-event-reveal'))).toContainText('капитала');
      await expect(actor.page.locator(sel('bank-charge'))).toBeVisible();
      for (const observer of players.filter(player => player !== actor)) {
        await expect(observer.page.locator(sel('special-event-reveal'))).toContainText('капитала');
        await expect(observer.page.locator(sel('charge-status'))).toBeVisible();
      }
      if (!captured) { await captureScreens(actor.page, 'chance-card'); captured = true; }
      await click(players, actor, 'pay-charge');
      const liquidation = players[0]!.events.findLast(entry =>
        ['AssetMortgaged', 'HouseSold'].includes(entry.event.type) && (entry.event.payload as { auto?: boolean }).auto === true)?.event;
      expect(liquidation, 'PayCharge includes at least one automatic liquidation').toBeDefined();
      for (const player of players) expect(player.events.findLast(entry => entry.event.type === liquidation!.type)?.event).toEqual(liquidation);
      expect(eventSeenByAll(players, 'ChargePaid').payload).toMatchObject({ payerId: actor.id });
    }
  }
  expect(cards, 'seed 129 draws both chance outcomes within four UI rolls').toEqual(new Set(['gain', 'loss']));
});

test('S3 a jailed player released by a double moves with no bonus', async ({ actors }) => {
  const players = await actors(3);
  let proved = false;
  for (let attempt = 0; attempt < 30 && !proved; attempt++) {
    await load(players, 'jail-choice');
    const prisoner = await active(players);
    const before = prisoner.view!.positions[prisoner.id];
    const start = prisoner.events.length;
    await click(players, prisoner, 'jail-roll');
    const events = prisoner.events.slice(start).map(entry => entry.event);
    const dice = events.find(event => event.type === 'DiceRolled')?.payload as { dice: number[] } | undefined;
    if (!dice || dice.dice[0] !== dice.dice[1]) continue;
    const moved = events.find(event => event.type === 'PlayerMoved')!.payload as { to: number };
    expect(events.map(event => event.type).slice(0, 3)).toEqual(['DiceRolled', 'JailReleased', 'PlayerMoved']);
    expect(moved.to).toBe((before! + dice.dice[0]! + dice.dice[1]!) % 40);
    expect(prisoner.view!.turn!.pendingBonus).toBe(false);
    expect(prisoner.view!.turn!.doublesStreak).toBe(0);
    for (const player of players) {
      expect(player.view!.jail[prisoner.id]).toBeUndefined();
      expect(player.view!.positions[prisoner.id]).toBe(moved.to);
      expect(player.view!.turn!.pendingBonus).toBe(false);
    }
    proved = true;
  }
  expect(proved, 'seeded stream reaches jail-release doubles').toBe(true);
});

test('S4 voluntary jail fee is debited before a normal roll', async ({ actors }) => {
  const players = await actors(3);
  await load(players, 'jail-choice');
  const prisoner = await active(players);
  const fee = Math.floor(prisoner.view!.economy!.lapReward / 4 / 10) * 10;
  const before = prisoner.view!.balances[prisoner.id]!;
  const start = prisoner.events.length;
  await click(players, prisoner, 'jail-pay-fee');
  expect(eventSeenByAll(players, 'BalanceChanged').payload).toMatchObject({ playerId: prisoner.id, delta: -fee, reason: 'jail-fee' });
  expect(prisoner.view!.balances[prisoner.id]).toBe(before - fee);
  await click(players, prisoner, 'RollDice');
  const tail = prisoner.events.slice(start).map(entry => entry.event.type);
  expect(tail.indexOf('BalanceChanged')).toBeLessThan(tail.indexOf('DiceRolled'));
  expect(tail).toContain('PlayerMoved');
  expect(eventSeenByAll(players, 'DiceRolled').payload).toMatchObject({ playerId: prisoner.id });
  expect(eventSeenByAll(players, 'PlayerMoved').payload).toMatchObject({ playerId: prisoner.id });
  for (const player of players) expect(player.view!.balances[prisoner.id]).toBe(before - fee);
  const dice = prisoner.events.slice(start).find(entry => entry.event.type === 'DiceRolled')!.event.payload as { double: boolean };
  if (dice.double) expect(prisoner.view!.turn!.pendingBonus).toBe(true);
});

test('S5 third failed jail attempt debits the forced fee before PlayerMoved', async ({ actors }) => {
  const players = await actors(3);
  let proved = false;
  for (let attempt = 0; attempt < 30 && !proved; attempt++) {
    await load(players, 'jail-third-attempt');
    const prisoner = await active(players);
    const start = prisoner.events.length;
    await click(players, prisoner, 'jail-roll');
    const events = prisoner.events.slice(start).map(entry => entry.event);
    const dice = events.find(event => event.type === 'DiceRolled')?.payload as { double: boolean } | undefined;
    if (dice?.double) continue;
    const feeIndex = events.findIndex(event => event.type === 'BalanceChanged' && (event.payload as { reason?: string }).reason === 'jail-fee');
    const moveIndex = events.findIndex(event => event.type === 'PlayerMoved');
    expect(feeIndex).toBeGreaterThanOrEqual(0);
    expect(feeIndex).toBeLessThan(moveIndex);
    expect(events[feeIndex]!.payload).toMatchObject({ playerId: prisoner.id, reason: 'jail-fee' });
    expect(events.find(event => event.type === 'JailReleased')!.payload).toMatchObject({ reason: 'fee-forced' });
    const release = eventSeenByAll(players, 'JailReleased');
    expect(release.payload).toMatchObject({ playerId: prisoner.id, reason: 'fee-forced' });
    for (const player of players) {
      const eventTypes = player.events.slice(start).map(entry => entry.event.type);
      expect(eventTypes.indexOf('BalanceChanged')).toBeLessThan(eventTypes.indexOf('PlayerMoved'));
      expect(player.view!.jail[prisoner.id]).toBeUndefined();
    }
    expect(prisoner.view!.jail[prisoner.id]).toBeUndefined();
    proved = true;
  }
  expect(proved, 'seeded stream reaches a third-attempt failure').toBe(true);
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
