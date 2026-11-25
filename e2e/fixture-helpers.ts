import { money } from './ru-text';
/** Shared helpers of the isolated fixture-stack specs (stage 4 and later). */
import type { TestInfo } from '@playwright/test';
import { cellRect } from '../apps/client/src/widgets/board/layout';
import { expect, sel, captureScreens, type Actor } from './helpers';

export const fast = { intervals: [20] };
export const q = (numerator: number, denominator: number) => 10 * Math.floor(numerator / (10 * denominator));
let assetCardCaptured = false;

export async function sync(players: Actor[], revision: number) {
  const current = () => players.map(player => player.view?.revision);
  try {
    await expect.poll(current, { ...fast, timeout: 15_000 }).toEqual(players.map(() => revision));
  } catch (error) {
    const actors = players.map((player, actor) => ({ actor, playerId: player.id, revision: player.view?.revision,
      welcomeRevision: player.welcomes.at(-1)?.revision }));
    throw new Error(`fixture sync expected revision ${revision}; actors=${JSON.stringify(actors)}`, { cause: error });
  }
}
export async function click(players: Actor[], actor: Actor, selector: string) {
  const before = actor.view!.revision;
  await actor.page.locator(sel(selector)).click();
  await expect.poll(() => actor.view?.revision, fast).toBeGreaterThan(before);
  await sync(players, actor.view!.revision);
}

/** Tokens stay inside test context and the existing trace sanitizer. No runtime state injection. */
export async function load(players: Actor[], fixture: string): Promise<string> {
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
    // Fixture turns use the real 45-second deadline. Wait for the game chunk,
    // but let each scenario wait for the canvas only if it needs pointer input.
    await expect(p.page.locator(sel('screen-game'))).toBeVisible();
    await expect(p.page.locator(sel('game-loading'))).toHaveCount(0);
  }));
  await sync(players, players[0]!.view!.revision);
  return roomId;
}
export async function shoot(players: Actor[], info: TestInfo, name: string) {
  for (const [i, p] of players.entries()) {
    if (process.env['E2E_DIALOG_EVIDENCE'] === '1') {
      const original = p.page.viewportSize() ?? { width: 1280, height: 720 };
      for (const [tag, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]] as const) {
        await p.page.setViewportSize({ width, height });
        const responsivePath = info.outputPath(`${name}-${i}-${tag}.png`);
        await p.page.screenshot({ path: responsivePath, fullPage: false });
        await info.attach(`${name}-${i}-${tag}`, { path: responsivePath, contentType: 'image/png' });
      }
      await p.page.setViewportSize(original);
      continue;
    }
    const path = info.outputPath(`${name}-${i}.png`);
    await p.page.screenshot({ path, fullPage: true });
    await info.attach(`${name}-${i}`, { path, contentType: 'image/png' });
  }
}
export async function balances(players: Actor[], expected: Readonly<Record<string, number>>) {
  for (const p of players) {
    expect(p.view!.balances).toEqual(expected);
    for (const [i, other] of players.entries()) {
      const row = p.page.locator(`${sel('player-balance')}[data-player-id="${other.id}"]`);
      await expect(row.locator(sel('player-balance-name'))).toHaveText(`Player ${i + 1}`);
      await expect(row.locator(sel('player-balance-value'))).toHaveText(money(expected[other.id]));
    }
  }
}
export async function card(p: Actor, cell: number) {
  if ((p.page.viewportSize()?.width ?? 1440) < 1024) {
    await p.page.locator(sel('game-tab-board')).click();
  }
  const canvas = p.page.locator(sel('board')).locator(sel('board-canvas'));
  await expect(canvas).toBeVisible();
  const box = (await canvas.boundingBox())!;
  const rect = cellRect(cell, box.width);
  await canvas.click({ position: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } });
  await expect(p.page.locator(sel('asset-card'))).toBeVisible();
  if (!assetCardCaptured && process.env['E2E_SCREEN_EVIDENCE'] === '1') {
    assetCardCaptured = true;
    await captureScreens(p.page, 'asset-card');
  }
}
export async function close(p: Actor) {
  await expect(p.page.locator(sel('asset-close'))).toHaveAccessibleName('Закрыть карточку актива');
  await p.page.locator(sel('asset-close')).click();
}
