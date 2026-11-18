import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type Page } from '@playwright/test';
import { test, expect, sel, createRoom, join, start, resign } from './helpers';

type ManifestEntry = { file: string; imports?: string[]; dynamicImports?: string[]; assets?: string[] };
type Manifest = Record<string, ManifestEntry>;

function filesFrom(manifest: Manifest, key: string, includeDynamic: boolean, seen = new Set<string>()): Set<string> {
  if (seen.has(key) || !manifest[key]) return seen;
  seen.add(key);
  for (const dep of manifest[key]!.imports ?? []) filesFrom(manifest, dep, includeDynamic, seen);
  if (includeDynamic && key !== 'index.html') for (const dep of manifest[key]!.dynamicImports ?? []) filesFrom(manifest, dep, true, seen);
  return seen;
}

function collectFileSet(manifest: Manifest, keys: string[], includeDynamic: boolean): Set<string> {
  const files = new Set<string>();
  for (const key of keys) for (const file of filesFrom(manifest, key, includeDynamic)) files.add(manifest[file]!.file);
  return files;
}

function expectedBrandLogo(manifest: Manifest, id: string): string | null {
  const key = Object.keys(manifest).find((entry) => entry.endsWith(`/catalog/logos/brand/${id}.svg`));
  return key === undefined ? null : `/${manifest[key]!.file}`;
}

const fileForRequest = (url: string): string => new URL(url).pathname.slice(1);

async function clearCache(page: Page): Promise<void> {
  const session = await page.context().newCDPSession(page);
  await session.send('Network.enable');
  await session.send('Network.clearBrowserCache');
  await session.send('Network.setCacheDisabled', { cacheDisabled: true });
}

test('defers game, board, Pixi, sound and dialogs until game entry and requests only board logos', async ({ actors }, info) => {
  test.setTimeout(180_000);
  const manifest = JSON.parse(readFileSync(resolve('apps/client/dist/.vite/manifest.json'), 'utf8')) as Manifest;
  const app = manifest['index.html']!;
  const gameKey = app.dynamicImports?.find((key) => !key.includes('game-over'));
  const gameOverKey = app.dynamicImports?.find((key) => key.includes('game-over'));
  expect(gameKey, 'Vite manifest has a dynamic game-screen entry').toBeTruthy();
  expect(gameOverKey, 'Vite manifest has a dynamic game-over dialog entry').toBeTruthy();
  const initialFiles = collectFileSet(manifest, ['index.html'], false);
  const gameFiles = collectFileSet(manifest, [gameKey!], true);
  gameFiles.delete(app.file);
  const pixiFiles = new Set(Object.entries(manifest)
    .filter(([key, entry]) => key.includes('/pixi.js/') && entry.file.endsWith('.js'))
    .map(([, entry]) => entry.file));
  const gameOverFile = manifest[gameOverKey!]!.file;
  expect(gameFiles.has(manifest[gameKey!]!.file)).toBe(true);
  expect(manifest[gameKey!]!.assets?.some((asset) => asset.endsWith('.mp3'))).toBe(true);
  expect([...pixiFiles].some((file) => gameFiles.has(file))).toBe(true);
  expect([...initialFiles].some((file) => pixiFiles.has(file))).toBe(false);

  const players = await actors(2, undefined, (_page, actor) => { actor.networkStage = 'login'; });
  const host = players[0]!;
  for (const player of players) {
    expect(await player.page.locator(sel('screen-lobby')).isVisible()).toBe(true);
    const pregame = player.network.filter((item) => ['login', 'lobby'].includes(item.stage));
    expect(pregame.some((item) => item.url.endsWith('.svg') || item.url.endsWith('.mp3'))).toBe(false);
    expect(pregame.some((item) => gameFiles.has(fileForRequest(item.url)))).toBe(false);
    expect(pregame.some((item) => item.url.endsWith(`/${gameOverFile}`))).toBe(false);
  }

  host.networkStage = 'room';
  players[1]!.networkStage = 'room';
  const room = await createRoom(host);
  await join(players[1]!, room);
  for (const player of players) {
    const roomRequests = player.network.filter((item) => item.stage === 'room');
    expect(roomRequests.some((item) => item.url.endsWith('.svg') || item.url.endsWith('.mp3'))).toBe(false);
    expect(roomRequests.some((item) => gameFiles.has(fileForRequest(item.url)))).toBe(false);
  }

  for (const player of players) player.networkStage = 'game';
  await start(players);
  await expect(host.page.locator(sel('board-canvas'))).toBeVisible();
  await expect.poll(() => host.view?.phase).toBe('setup');
  const visibleIds = new Set((host.view!.board?.cells ?? []).flatMap((cell) => cell.asset ? [cell.asset.assetId] : []));
  const expectedLogos = new Set([...visibleIds].map((id) => expectedBrandLogo(manifest, id)).filter((url): url is string => url !== null));
  await expect.poll(() => new Set(host.network.filter((item) => item.stage === 'game' && item.url.endsWith('.svg')).map((item) => item.url)).size).toBe(expectedLogos.size);
  const gameRequests = host.network.filter((item) => item.stage === 'game');
  const actualLogos = gameRequests.filter((item) => item.url.endsWith('.svg')).map((item) => new URL(item.url).pathname);
  expect(new Set(actualLogos)).toEqual(expectedLogos);
  expect(new Set(actualLogos).size).toBe(actualLogos.length);
  expect(actualLogos.some((url) => url.includes('-dark-'))).toBe(false);
  expect(gameRequests.some((item) => gameFiles.has(fileForRequest(item.url)))).toBe(true);
  expect(gameRequests.some((item) => pixiFiles.has(fileForRequest(item.url)))).toBe(true);
  const welcomes = host.welcomes.length;
  host.networkStage = 'reload-game';
  await clearCache(host.page);
  await host.page.reload();
  await expect(host.page.locator(sel('screen-game'))).toBeVisible();
  await expect(host.page.locator(sel('board-canvas'))).toBeVisible();
  await expect.poll(() => host.welcomes.length).toBeGreaterThan(welcomes);
  const reloadRequests = host.network.filter((item) => item.stage === 'reload-game');
  expect(reloadRequests.some((item) => gameFiles.has(fileForRequest(item.url)))).toBe(true);

  host.networkStage = 'game';
  await resign(host);
  await expect(host.page.locator(sel('game-over-title'))).toBeVisible();
  expect(host.network.some((item) => item.stage === 'game' && item.url.endsWith(`/${gameOverFile}`))).toBe(true);

  const networkPath = info.outputPath('load-split-network.json');
  writeFileSync(networkPath, JSON.stringify({ manifest: { initialFiles: [...initialFiles], gameFiles: [...gameFiles], pixiFiles: [...pixiFiles], gameOverFile }, players: players.map((player, index) => ({ player: index + 1, requests: player.network })) }, null, 2));
  await info.attach('load-split-network', { path: networkPath, contentType: 'application/json' });
});
