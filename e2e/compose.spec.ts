import { execFileSync } from 'node:child_process';
import { test, expect, sel, createRoom, join, start, setup, active, action, resign } from './helpers';

test('three guests: setup, movement, reload, server restart and resignation to winner', async ({ actors }) => {
  test.skip(process.env['E2E_DETERMINISTIC'] === '1', 'Recovery uses production CSPRNG');
  const players = await actors(3), host = players[0]!;
  const room = await createRoom(host);
  for (const p of players.slice(1)) await join(p, room);
  await start(players); await setup(players);
  for (let i = 0; i < 4; i++) {
    const actor = await active(players);
    const before = actor.view!.positions[actor.id]!;
    await action(actor, 'RollDice');
    const rolled = actor.events.filter(e => e.event.type === 'DiceRolled').at(-1)!.event.payload as { dice: number[] };
    if (!actor.view!.jail[actor.id]) expect(actor.view!.positions[actor.id]).toBe((before + rolled.dice[0]! + rolled.dice[1]!) % 40);
    if (actor.view!.turn?.playerId === actor.id && actor.view!.turn.rolled) await action(actor, 'EndTurn');
    await expect.poll(() => host.view?.revision).toBe(actor.view!.revision);
  }
  const current = await active(players), id = current.id, revision = current.view!.revision;
  const welcomeCount = current.welcomes.length;
  await current.page.reload();
  await expect(current.page.locator('[data-screen="game"]')).toBeVisible();
  await expect.poll(() => current.view?.revision).toBe(revision);
  await expect.poll(() => current.welcomes.length).toBeGreaterThan(welcomeCount);
  expect(current.welcomes.at(-1)!.playerId).toBe(id);
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
  }
  const resumed = await active(players);
  await action(resumed, resumed.view!.turn!.rolled ? 'EndTurn' : 'RollDice');
  await resign(players[2]!); await resign(players[1]!);
  for (const p of players) {
    await expect(p.page.getByRole('heading', { name: 'Game over', exact: true })).toBeVisible();
    await expect(p.page.locator(sel('winner'))).toHaveText('Winner: Player 1');
  }
});

test('locked code and invite, participant leave and creator closes room', async ({ actors }) => {
  test.skip(process.env['E2E_DETERMINISTIC'] === '1', 'Separate fresh deterministic fixture');
  const [host, guest] = await actors(2);
  const room = await createRoom(host!, 'browser-fixture-code');
  await join(guest!, room, 'browser-fixture-code');
  const invite = await host!.page.locator(sel('invite-link')).inputValue();
  const [third] = await actors(1, invite);
  await expect(third!.page.locator('[data-screen="room"]')).toBeVisible();
  await expect(host!.page.locator(sel('member'))).toHaveCount(3);
  await guest!.page.locator(sel('leave')).click();
  await expect(guest!.page.locator('[data-screen="lobby"]')).toBeVisible();
  await expect(host!.page.locator(sel('member'))).toHaveCount(2);
  await host!.page.locator(sel('leave')).click();
  await expect(host!.page.locator('[data-screen="lobby"]')).toBeVisible();
  await expect(third!.page.locator('[data-screen="lobby"]')).toBeVisible();
  await third!.page.locator(sel('refresh')).click();
  await expect(third!.page.locator(sel('room')).filter({ hasText: room })).toHaveCount(0);
  // Read Docker's raw runtime logs before the artifact sanitizer can redact them.
  const rawWebLogs = execFileSync('bash', ['-lc', process.env['E2E_WEB_LOGS_COMMAND']
    ?? "sg docker -c 'docker compose -p s1-e2e logs --no-color web'"], { encoding: 'utf8' });
  expect(/"GET \/(?:index\.html)? HTTP\//.test(rawWebLogs), 'raw web logs contain page requests').toBe(true);
  expect(rawWebLogs.includes('code='), 'raw web logs must omit invite query and Referer credentials').toBe(false);
});

test('AFK uses actual 45 second auto-roll and 20 second continuation', async ({ actors }) => {
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
  await expect.poll(() => host.view?.turn?.turnId, { timeout: 25_000 }).not.toBe(original.turnId);
  const ended = host.events.find(e => e.event.type === 'TurnEnded')!;
  expect(ended.at).toBeGreaterThanOrEqual(continued.deadline);
  expect(ended.event.payload).toMatchObject({ reason: 'timeout' });
});

test('seed 1036: setup tie, three doubles jail before movement and interim jail attempt', async ({ actors }) => {
  test.skip(process.env['E2E_DETERMINISTIC'] !== '1', 'Requires fresh test-only seeded stack');
  const players = await actors(2), host = players[0]!;
  const room = await createRoom(host); await join(players[1]!, room);
  await start(players);
  expect(await setup(players)).toBe(4);
  const prisoner = await active(players);
  for (const dice of [[1, 1], [5, 5]]) {
    await action(prisoner, 'RollDice');
    expect(prisoner.events.filter(e => e.event.type === 'DiceRolled').at(-1)!.event.payload).toMatchObject({ dice, double: true });
    await action(prisoner, 'EndTurn');
  }
  const count = prisoner.events.length;
  await action(prisoner, 'RollDice');
  const events = prisoner.events.slice(count).map(e => e.event);
  expect(events.map(e => e.type)).toEqual(['DiceRolled', 'SentToJail', 'TurnEnded', 'TurnStarted']);
  expect(events[0]!.payload).toMatchObject({ dice: [6, 6], double: true });
  expect(prisoner.view!.positions[prisoner.id]).toBe((events[1]!.payload as { to: number }).to);
  expect(prisoner.view!.jail[prisoner.id]).toEqual({ attemptsUsed: 0 });
  expect(prisoner.view!.turn!.doublesStreak).toBe(0);
  await expect(prisoner.page.locator(sel('jail'))).toContainText('interim rule');
  await expect.poll(() => host.view?.revision).toBe(prisoner.view!.revision);
  for (let i = 0; host.view!.turn!.playerId !== prisoner.id; i++) {
    expect(i).toBeLessThan(10);
    const other = await active(players); await action(other, 'RollDice');
    if (other.view!.turn!.rolled) await action(other, 'EndTurn');
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
    await expect(prisoner.page.locator(sel('jail'))).toContainText('1 attempts used');
  } else {
    expect(attempt.map(e => e.type)).toEqual(['DiceRolled', 'InterimJailReleased', 'PlayerMoved']);
    expect(attempt[1]!.payload).toMatchObject({ reason: 'double' });
  }
  expect(prisoner.view!.turn!.pendingBonus).toBe(false);
  expect(prisoner.events.at(-1)!.revision).toBe(prisoner.view!.revision);
});
