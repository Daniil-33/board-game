import { mkdirSync } from 'node:fs';
import { test, expect, sel, createRoom, join, start, setup, type Actor } from './helpers';
import type { Locator } from '@playwright/test';
import { cellRect, cellStrip } from '../apps/client/src/widgets/board/layout';

test('production board renders group and special colors at desktop and mobile sizes', async ({ actors }, info) => {
  const players = await actors(2), host = players[0]!;
  const room = await createRoom(host);
  await join(players[1]!, room);
  await start(players);
  await setup(players);
  const canvas = host.page.locator(`${sel('board')} ${sel('board-canvas')}`);
  await expect(canvas).toBeVisible();

  const groupPixels = await sample(host, canvas, 1, 'group');
  const specialPixels = await sample(host, canvas, 0, 'special');
  const fallback = await host.page.evaluate(() => {
    const context = document.createElement('canvas').getContext('2d')!;
    const parse = (value: string) => {
      context.fillStyle = '#000'; context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).reduce((n, c) => (n << 8) | c, 0);
    };
    const style = getComputedStyle(document.documentElement);
    return { inset: parse(style.getPropertyValue('--light-inset').trim()), cell: parse(style.getPropertyValue('--light-cell').trim()) };
  });
  expect(groupPixels.some(pixel => pixel !== fallback.inset), 'group strip must not be the inset fallback').toBe(true);
  expect(specialPixels.some(pixel => pixel !== fallback.cell), 'special corner must not be the cell fallback').toBe(true);

  const evidenceDir = process.env['TASK_BOARD_COLOR_EVIDENCE'];
  for (const [tag, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]] as const) {
    await host.page.setViewportSize({ width, height });
    await expect(canvas).toBeVisible();
    const path = info.outputPath(`board-colors-${tag}.png`);
    await host.page.screenshot({ path, fullPage: false });
    await info.attach(`board-colors-${tag}`, { path, contentType: 'image/png' });
    if (evidenceDir) {
      mkdirSync(evidenceDir, { recursive: true });
      await host.page.screenshot({ path: `${evidenceDir}/production-${tag}.png`, fullPage: false });
    }
  }
});

async function sample(actor: Actor, canvas: Locator, cell: number, area: 'group' | 'special'): Promise<number[]> {
  const box = (await canvas.boundingBox())!;
  const rect = cellRect(cell, 660), scale = box.width / 660;
  const points: [number, number][] = area === 'group'
    ? (() => { const strip = cellStrip(cell, rect).bounds; return [[strip.x + strip.width / 2, strip.y + strip.height / 2]]; })()
    : [[rect.x + 8, rect.y + 8], [rect.x + rect.width - 8, rect.y + 8], [rect.x + 8, rect.y + rect.height - 8]];
  const png = (await canvas.screenshot()).toString('base64');
  const values = await actor.page.evaluate(async ({ png, points, scale }) => {
    const image = new Image(); image.src = `data:image/png;base64,${png}`; await image.decode();
    const target = document.createElement('canvas'); target.width = image.width; target.height = image.height;
    const context = target.getContext('2d')!; context.drawImage(image, 0, 0);
    return points.map(([x, y]) => {
      const [r, g, b] = context.getImageData(Math.floor(x * scale), Math.floor(y * scale), 1, 1).data;
      return (r! << 16) | (g! << 8) | b!;
    });
  }, { png, points, scale });
  return values;
}
