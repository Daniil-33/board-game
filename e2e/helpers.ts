import { test as base, expect, type Page, type BrowserContext, type Request } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join as pathJoin } from 'node:path';
import type { StateView, GameEvent } from '../packages/game-core/src/index';

const roomCode = 'browser-fixture-code';
export const sel = (name: string) => `[data-testid="${name}"]`;
/** Capture one unchanged app state at both review viewports on the current test head. */
export async function captureScreens(page: Page, name: string): Promise<void> {
  if (process.env['E2E_SCREEN_EVIDENCE'] !== '1') return;
  const dir = process.env['E2E_SCREEN_EVIDENCE_DIR'];
  if (!dir) throw new Error('E2E_SCREEN_EVIDENCE_DIR is required when E2E_SCREEN_EVIDENCE=1');
  mkdirSync(dir, { recursive: true });
  const original = page.viewportSize() ?? { width: 1280, height: 720 };
  for (const [tag, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]] as const) {
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: pathJoin(dir, `${name}-${tag}.png`), fullPage: false });
  }
  await page.setViewportSize(original);
  const producerHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const versionResponse = await page.request.get(new URL('/version.txt', page.url()).toString());
  if (!versionResponse.ok()) throw new Error(`Unable to read served /version.txt (${versionResponse.status()})`);
  const servedVersion = (await versionResponse.text()).trim();
  if (!servedVersion) throw new Error('Served /version.txt is empty');
  writeFileSync(pathJoin(dir, `capture-manifest-${name}.json`), JSON.stringify({
    producerHead,
    screen: name,
    viewports: ['desktop', 'mobile'],
    servedVersion,
    capturedAtUtc: new Date().toISOString(),
  }, null, 2) + '\n');
}
export interface Actor {
  page: Page;
  context: BrowserContext;
  id: string;
  view: StateView | null;
  welcomes: { playerId: string; revision: number }[];
  events: { at: number; revision: number; event: GameEvent }[];
  acks: { at: number; commandId: string; outcome: string; revision: number; error?: { code: string } }[];
  chats: { seq: number; authorId: string; text: string }[];
  chatAcks: { clientMsgId: string; ok: boolean; reason?: string }[];
  networkStage: 'login' | 'lobby' | 'room' | 'game' | 'reload-game';
  network: { stage: Actor['networkStage']; url: string; method: string; resourceType: string; status?: number; contentLength?: number; contentEncoding?: string }[];
}
export const test = base.extend<{ actors: (count: number, invite?: string, observe?: (page: Page, actor: Actor) => void) => Promise<Actor[]> }>({
  actors: async ({ browser, baseURL }, use, info) => {
    const actors: Actor[] = [], secrets: string[] = [roomCode], traces: string[] = [];
    appendFileSync('.e2e-secrets.jsonl', JSON.stringify(roomCode) + '\n');
    const log: unknown[] = [];
    const remember = (secret: string) => { secrets.push(secret); appendFileSync('.e2e-secrets.jsonl', JSON.stringify(secret) + '\n'); };
    await use(async (count, invite, observe) => {
      const added: Actor[] = [];
      for (let i = 0; i < count; i++) {
        const context = await browser.newContext({ baseURL: baseURL! });
        await context.tracing.start({ screenshots: false, snapshots: true, sources: false });
        const page = await context.newPage();
        // Test-only handle on the page's own game socket, used to send a frame the UI refuses to send.
        await page.addInitScript(() => {
          const Native = window.WebSocket;
          window.WebSocket = class extends Native {
            constructor(url: string | URL, protocols?: string | string[]) {
              super(url, protocols);
              (window as unknown as { __e2eSocket: WebSocket }).__e2eSocket = this;
            }
          };
        });
        const actor: Actor = { context, page, id: '', view: null, welcomes: [], events: [], acks: [], chats: [], chatAcks: [], networkStage: 'login', network: [] };
        actors.push(actor); added.push(actor);
        if (observe) {
          const requests = new Map<Request, Actor['network'][number]>();
          page.on('request', (request) => {
            const url = new URL(request.url());
            const record: Actor['network'][number] = { stage: actor.networkStage, url: `${url.origin}${url.pathname}`, method: request.method(), resourceType: request.resourceType() };
            requests.set(request, record);
            actor.network.push(record);
          });
          page.on('response', async (response) => {
            const record = requests.get(response.request());
            if (!record) return;
            const headers = await response.allHeaders();
            record.status = response.status();
            if (headers['content-length'] !== undefined) record.contentLength = Number(headers['content-length']);
            if (headers['content-encoding'] !== undefined) record.contentEncoding = headers['content-encoding'];
          });
          observe(page, actor);
        }
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
          if (frame.t === 'Ack') {
            actor.acks.push({ at: Date.now(), ...frame });
            log.push({ at: Date.now(), actor: actors.indexOf(actor), frame: 'Ack', commandId: frame.commandId, outcome: frame.outcome, revision: frame.revision, error: frame.error?.code });
          }
          if (frame.t === 'Welcome') actor.welcomes.push({ playerId: frame.playerId, revision: frame.revision });
          if (frame.t === 'Chat') actor.chats.push(frame.message);
          if (frame.t === 'ChatAck') actor.chatAcks.push(frame);
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
        await expect(page.locator(sel('nickname'))).toHaveAccessibleName('Ник');
        await expect(page.locator(sel('login-enter'))).toHaveAccessibleName('Войти');
        if (actors.length === 1) await captureScreens(page, 'login');
        await page.locator(sel('nickname')).fill(`Player ${actors.length}`);
        await page.locator(sel('login-enter')).click();
        await expect(page.locator(sel('screen-login'))).toHaveCount(0);
        actor.networkStage = 'lobby';
        if (actors.length === 1) await captureScreens(page, 'lobby');
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
  await host.page.locator(sel('open-create')).click();
  if (code) await host.page.locator(sel('create-code')).fill(code);
  await captureScreens(host.page, 'create-room');
  await host.page.locator(sel('create')).click();
  await expect(host.page.locator(sel('screen-room'))).toBeVisible();
  await expect.poll(() => host.view?.phase).toBe('lobby');
  await expect(host.page.locator(sel('room-title'))).toHaveRole('heading');
  await expect(host.page.locator(sel('room-title'))).toHaveText(/^Комната r_/);
  await captureScreens(host.page, 'room');
  return (await host.page.locator(sel('room-title')).innerText()).replace('Комната ', '');
}
export async function join(actor: Actor, roomId: string, code?: string): Promise<void> {
  await actor.page.locator(sel('refresh')).click();
  const row = actor.page.locator(`${sel('room')}[data-room-id="${roomId}"]`);
  await expect(row).toBeVisible();
  await row.locator(sel('join')).click();
  if (code) {
    await actor.page.locator(sel('join-code')).fill(code);
    await actor.page.locator(sel('submit-join-code')).click();
  }
  await expect(actor.page.locator(sel('screen-room'))).toBeVisible();
  await expect.poll(() => actor.view?.phase).toBe('lobby');
}
export async function start(players: Actor[]): Promise<void> {
  await expect(players[0]!.page.locator(sel('member'))).toHaveCount(players.length);
  await players[0]!.page.locator(sel('start')).click();
  for (const p of players) {
    await waitGameReady(p);
  }
}
/** Wait for the async game chunk and board mount through observable UI state. */
export async function waitGameReady(actor: Actor): Promise<void> {
  await expect(actor.page.locator(sel('screen-game'))).toBeVisible();
  await expect(actor.page.locator(sel('game-loading'))).toHaveCount(0);
  await expect(actor.page.locator(sel('board-canvas'))).toBeVisible();
}
export async function action(actor: Actor, type: string): Promise<void> {
  if (type === 'EndTurn' && actor.view?.turn?.rolled) {
    const turnId = actor.view.turn.turnId;
    const endTurn = actor.page.locator(sel(type));
    await expect(endTurn).toBeVisible();
    // Race the rendered action against the authoritative turn projection. If
    // the timeout wins, the changed turn is the successful outcome. If the
    // button is enabled first, dispatch it atomically with the enabled check;
    // a timeout that wins between those observations is still accepted below.
    await expect.poll(async () => actor.view?.turn?.turnId !== turnId || await endTurn.isEnabled()).toBe(true);
    if (actor.view?.turn?.turnId === turnId) {
      await endTurn.evaluate((element) => {
        if (!(element instanceof HTMLButtonElement) || element.disabled) return;
        element.click();
      });
    }
    await expect.poll(() => actor.view?.turn?.turnId).not.toBe(turnId);
    return;
  }
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
  await expect(host.page.locator(sel('board')).locator(sel('board-canvas'))).toBeVisible();
  return rolls;
}
export async function active(players: Actor[]): Promise<Actor> {
  await expect.poll(() => {
    const revisions = players.map(p => p.view?.revision);
    return revisions.every(revision => revision !== undefined) && new Set(revisions).size === 1;
  }).toBe(true);
  const first = players[0]!;
  const actor = players.find(p => p.id === first.view?.turn?.playerId)!;
  return actor;
}
/** Sends a command frame on the page's live socket, bypassing the UI's button guard. */
export async function sendRaw(actor: Actor, frame: object): Promise<void> {
  await actor.page.evaluate((text) => {
    const socket = (window as unknown as { __e2eSocket?: WebSocket }).__e2eSocket;
    if (!socket || socket.readyState !== WebSocket.OPEN) throw Error('game socket is not open');
    socket.send(text);
  }, JSON.stringify(frame));
}
export async function resign(actor: Actor): Promise<void> {
  const more = actor.page.locator(sel('game-tab-more'));
  const needsTab = await more.isVisible() && actor.view?.phase === 'playing';
  if (needsTab) await more.click();
  await actor.page.locator(sel('Resign')).click();
  await action(actor, 'confirm-resign');
  if (needsTab && actor.view?.phase === 'playing') await actor.page.locator(sel('game-tab-board')).click();
}
