import { test as base, expect, type Page, type BrowserContext } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';
import type { StateView, GameEvent } from '../packages/game-core/src/index';

const roomCode = 'browser-fixture-code';
export const sel = (name: string) => `[data-test="${name}"]`;
export interface Actor {
  page: Page;
  context: BrowserContext;
  id: string;
  view: StateView | null;
  events: { at: number; revision: number; event: GameEvent }[];
}
export const test = base.extend<{ actors: (count: number, invite?: string) => Promise<Actor[]> }>({
  actors: async ({ browser, baseURL }, use, info) => {
    const actors: Actor[] = [], secrets: string[] = [roomCode], traces: string[] = [];
    appendFileSync('.e2e-secrets.jsonl', JSON.stringify(roomCode) + '\n');
    const log: unknown[] = [];
    const remember = (secret: string) => { secrets.push(secret); appendFileSync('.e2e-secrets.jsonl', JSON.stringify(secret) + '\n'); };
    await use(async (count, invite) => {
      const added: Actor[] = [];
      for (let i = 0; i < count; i++) {
        const context = await browser.newContext({ baseURL: baseURL! });
        await context.tracing.start({ screenshots: false, snapshots: true, sources: false });
        const page = await context.newPage();
        const actor: Actor = { context, page, id: '', view: null, events: [] };
        actors.push(actor); added.push(actor);
        page.on('response', async (response) => {
          if (response.url().endsWith('/api/guests') && response.status() === 201) {
            const body = await response.json(); actor.id = body.guestId; remember(body.token);
          }
          if (response.request().method() === 'POST' && /\/api\/rooms$/.test(response.url()) && response.status() === 201) {
            const body = await response.json(); if (body.accessCode) remember(body.accessCode);
          }
        });
        page.on('websocket', (ws) => ws.on('framereceived', ({ payload }) => {
          const frame = JSON.parse(payload.toString());
          if (frame.t === 'Welcome' || frame.t === 'Update') {
            actor.view = frame.view;
            log.push({ at: Date.now(), actor: actors.indexOf(actor), frame: frame.t, revision: frame.revision, phase: frame.view.phase });
            for (const event of frame.events ?? []) {
              actor.events.push({ at: Date.now(), revision: frame.revision, event });
              log.push({ at: Date.now(), actor: actors.indexOf(actor), revision: frame.revision, event });
            }
          }
        }));
        await page.goto(invite ?? '/');
        await page.getByLabel('Nickname', { exact: true }).fill(`Player ${actors.length}`);
        await page.getByRole('button', { name: 'Enter', exact: true }).click();
        await expect(page.locator('[data-screen="login"]')).toHaveCount(0);
      }
      return added;
    });
    try {
      for (let i = 0; i < actors.length; i++) {
        const path = info.outputPath(`browser-${i}.zip`);
        await actors[i]!.context.tracing.stop({ path }); traces.push(path);
        await actors[i]!.context.close();
      }
      if (traces.length) execFileSync('python3', ['scripts/sanitize-trace.py', ...traces], { input: JSON.stringify(secrets) });
      for (let i = 0; i < traces.length; i++) await info.attach(`trace-${i}`, { path: traces[i]!, contentType: 'application/zip' });
      const path = info.outputPath('scenario.json');
      writeFileSync(path, JSON.stringify({ scenario: info.title, status: info.status, log }, null, 2));
      await info.attach('scenario-log', { path, contentType: 'application/json' });
    } catch (error) {
      // A sanitizer failure must fail the test; never upload unsanitized traces.
      for (const path of traces) { const { unlinkSync } = await import('node:fs'); unlinkSync(path); }
      throw error;
    }
  },
});
export { expect };
export async function createRoom(host: Actor, code?: string): Promise<string> {
  if (code) await host.page.locator(sel('create-code')).fill(code);
  await host.page.locator(sel('create')).click();
  await expect(host.page.locator('[data-screen="room"]')).toBeVisible();
  await expect.poll(() => host.view?.phase).toBe('lobby');
  return (await host.page.getByRole('heading', { name: /^Room r_/ }).innerText()).replace('Room ', '');
}
export async function join(actor: Actor, roomId: string, code?: string): Promise<void> {
  await actor.page.locator(sel('refresh')).click();
  const row = actor.page.locator(sel('room')).filter({ hasText: roomId });
  await expect(row).toBeVisible();
  if (code) await row.locator(sel('join-code')).fill(code);
  await row.locator(sel('join')).click();
  await expect(actor.page.locator('[data-screen="room"]')).toBeVisible();
  await expect.poll(() => actor.view?.phase).toBe('lobby');
}
export async function start(players: Actor[]): Promise<void> {
  await expect(players[0]!.page.locator(sel('member'))).toHaveCount(players.length);
  await players[0]!.page.locator(sel('start')).click();
  for (const p of players) await expect(p.page.locator('[data-screen="game"]')).toBeVisible();
}
export async function action(actor: Actor, type: string): Promise<void> {
  const revision = actor.view!.revision;
  await actor.page.locator(sel(type)).click();
  await expect.poll(() => actor.view?.revision).toBeGreaterThan(revision);
}
export async function setup(players: Actor[]): Promise<number> {
  let rolls = 0;
  while (players[0]!.view?.phase === 'setup') {
    const view = players[0]!.view!;
    const actor = players.find(p => p.id === view.setup!.playerId)!;
    await expect.poll(() => actor.view?.revision).toBe(view.revision);
    await action(actor, 'RollForOrder'); rolls++;
    await expect.poll(() => players[0]!.view?.revision).toBeGreaterThan(view.revision);
    if (rolls > 30) throw Error('Setup failed to resolve in 30 rolls');
  }
  const host = players[0]!;
  const orderEvent = host.events.find(e => e.event.type === 'TurnOrderDetermined')!;
  expect(orderEvent.event.payload).toEqual({ order: host.view!.order });
  const names = new Map(players.map(p => [p.id, `Player ${players.indexOf(p) + 1}`]));
  await expect(host.page.locator(sel('order-name'))).toHaveText(host.view!.order!.map(id => names.get(id)!));
  await expect(host.page.locator(sel('board')).locator('canvas')).toBeVisible();
  return rolls;
}
export async function active(players: Actor[]): Promise<Actor> {
  const first = players[0]!;
  const actor = players.find(p => p.id === first.view?.turn?.playerId)!;
  await expect.poll(() => actor.view?.revision).toBe(first.view!.revision);
  return actor;
}
export async function resign(actor: Actor): Promise<void> {
  await actor.page.locator(sel('Resign')).click();
  await action(actor, 'confirm-resign');
}
