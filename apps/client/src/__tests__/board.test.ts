import { describe, expect, it, vi } from 'vitest';
import { Text, Texture } from 'pixi.js';
import { CLASSIC_40 } from '@game/game-core';
import { BoardScene, type SceneClock } from '../widgets/board/index';
import { cellRect, cellStrip, jailBox } from '../widgets/board/index';
import { playingView, setupView } from './helpers';
import { boardTheme } from '../shared/config/index';
import { cacheLogoTextures } from '../widgets/board/textures';

/** Runs every animation to its end at once. */
const instant: SceneClock = {
  animate: async (_ms, frame, cancelled) => {
    if (cancelled()) return false;
    frame(1);
    return true;
  },
};

const token = (scene: BoardScene, id: string) => scene.tokens.children.find((c) => c.label === `token-${id}`)!;
const within = (p: { x: number; y: number }, r: { x: number; y: number; width: number; height: number }): boolean =>
  p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;

// Smoke test: the scene graph only, no renderer (there is no WebGL here).
describe('board scene', () => {
  it('holds 40 cells, a jail marker, generated labels and one token per player', () => {
    const scene = new BoardScene(660, instant);
    scene.snap(playingView(['a', 'b', 'c']), 'a');
    expect(scene.cells.children).toHaveLength(CLASSIC_40.size);
    expect(scene.jailMarker.label).toBe('jail-box');
    expect(scene.cells.children[1]!.getChildByLabel('logo-fallback')).toBeTruthy();
    expect(scene.tokens.children).toHaveLength(3);
  });

  it('puts tokens on the cells of the view, jailed players inside the jail box', () => {
    const scene = new BoardScene(660, instant);
    scene.snap(playingView(['a', 'b', 'c'], { positions: { a: 5, b: 10, c: 10 }, jail: { c: { attemptsUsed: 1 } } }), 'a');
    const jail = cellRect(10, 660);
    expect(within(token(scene, 'a'), cellRect(5, 660))).toBe(true);
    expect(within(token(scene, 'b'), jail)).toBe(true);
    expect(within(token(scene, 'b'), jailBox(jail))).toBe(false);
    expect(within(token(scene, 'c'), jailBox(jail))).toBe(true);
  });

  it('keeps tokens off the ring while the view has no positions', () => {
    const scene = new BoardScene(660, instant);
    scene.snap(setupView(['a', 'b']), 'a');
    expect(scene.tokens.children).toHaveLength(2);
    for (let i = 0; i < 40; i++) expect(within(token(scene, 'a'), cellRect(i, 660))).toBe(false);
  });

  it('drops the token of a player who is no longer in the view', () => {
    const scene = new BoardScene(660, instant);
    scene.snap(playingView(['a', 'b', 'c']), 'a');
    scene.snap(playingView(['a', 'b']), 'a');
    expect(scene.tokens.children).toHaveLength(2);
  });

  it('plays hop and jump steps onto the named cell', async () => {
    const scene = new BoardScene(660, instant);
    scene.snap(playingView(['a', 'b']), 'a');
    await scene.play({ kind: 'dice', playerId: 'a', dice: [3, 4] });
    await scene.play({ kind: 'hop', playerId: 'a', cell: 1 });
    expect(within(token(scene, 'a'), cellRect(1, 660))).toBe(true);
    await scene.play({ kind: 'jump', playerId: 'a', cell: 10 });
    expect(within(token(scene, 'a'), jailBox(cellRect(10, 660)))).toBe(true);
    // Steps for an unknown player or of other kinds do not throw.
    await scene.play({ kind: 'hop', playerId: 'nobody', cell: 3 });
    await scene.play({ kind: 'orderDie', playerId: 'a', value: 6 });
    await scene.play({ kind: 'banner', playerId: 'a', text: 'x' });
    await scene.play({ kind: 'highlight', playerId: 'b' });
  });
});

describe('eliminated tokens', () => {
  it('hides eliminated players and retains survivor token identity, color and slot', async () => {
    const scene = new BoardScene(660, instant);
    const before = playingView(['a', 'b', 'c']); scene.snap(before, 'a');
    const survivor = token(scene, 'c'); const at = { x: survivor.x, y: survivor.y };
    scene.snap({ ...before, eliminated: ['a' as never] }, 'b');
    expect(token(scene, 'a').visible).toBe(false); expect(token(scene, 'c')).toBe(survivor);
    expect({ x: survivor.x, y: survivor.y }).toEqual(at);
    await scene.play({ kind: 'hop', playerId: 'a', cell: 3 }); expect(token(scene, 'a').visible).toBe(false);
  });
});

describe('cell details', () => {
  it('preserves all hit rectangles and hides asset text at compact sizes', () => {
    const scene = new BoardScene();
    const view = playingView(['a', 'b']);
    scene.snap(view, 'a');
    const cells = scene.cells.children.slice();
    for (const width of [360, 390, 430, 660]) {
      scene.setDisplayWidth(width);
      for (const { index, asset } of view.board!.cells) {
        const cell = scene.cells.children[index]!;
        expect(cell).toBe(cells[index]);
        if (asset === null) continue;
        expect(cell.hitArea).toMatchObject(cellRect(index, 660));
        expect(cell.children.filter(child => child instanceof Text).map(child => child.visible))
          .toEqual([width === 660, width === 660]);
        expect(cell.getChildByLabel('logo-fallback')?.visible).toBe(true);
      }
    }
  });

  it('keeps the fallback when the URL is missing or the texture fails', async () => {
    const loader = vi.fn().mockRejectedValue(new Error('missing texture'));
    const cached = cacheLogoTextures(loader);
    const scene = new BoardScene(660, instant, boardTheme(), () => false, cached);
    expect(loader).not.toHaveBeenCalled();
    const view = playingView(['a', 'b']);
    const cells = view.board!.cells.map(cell => cell.index === 1
      ? { ...cell, asset: { ...cell.asset!, assetId: 'unknown' as never } }
      : cell);
    scene.snap({ ...view, board: { ...view.board!, cells } }, 'a');
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(cells.filter(cell => cell.asset !== null).length - 1));
    expect(scene.cells.children[1]?.getChildByLabel('logo-fallback')?.visible).toBe(true);
    const rejected = scene.cells.children[3]!.getChildByLabel('logo-fallback')!;
    expect(rejected.visible).toBe(true);
    expect(rejected.children[1]).toBeInstanceOf(Text);
    expect((rejected.children[1] as Text).text).not.toBe('');
  });

  it('deduplicates pending GPU textures by URL and ignores replaced cells', async () => {
    let complete!: (texture: Texture) => void;
    const loader = vi.fn(() => new Promise<Texture>(resolve => { complete = resolve; }));
    const cached = cacheLogoTextures(loader);
    const pending = cached('/asset.svg');
    expect(cached('/asset.svg')).toBe(pending);
    const scene = new BoardScene(660, instant, boardTheme(), () => false, () => pending);
    const view = playingView(['a', 'b']);
    scene.snap(view, 'a');
    const cell = scene.cells.children[1]!;
    scene.snap({ ...view, board: null }, 'a');
    scene.snap(view, 'a');
    await Promise.resolve();
    complete(Texture.WHITE);
    await pending;
    expect(loader).toHaveBeenCalledOnce();
    expect(cell.destroyed).toBe(true);
    expect(scene.cells.children[1]!.getChildByLabel('company-logo')).toBeTruthy();
    expect(scene.cells.children[1]!.getChildByLabel('logo-fallback')?.visible).toBe(false);
  });
});

it('gives six players sharing a cell distinct token slots', () => {
  const scene = new BoardScene();
  const players = ['a', 'b', 'c', 'd', 'e', 'f'];
  scene.snap(playingView(players, { positions: Object.fromEntries(players.map(id => [id, 4])) }), 'a');
  const points = scene.tokens.children.map(({ x, y }) => ({ x, y }));
  expect(new Set(points.map(({ x, y }) => `${x},${y}`)).size).toBe(6);
  expect(points.every(point => within(point, cellRect(4, 660)))).toBe(true);
});

it('draws each board token with the CSS color for its projected seat', () => {
  const players = ['p6', 'p2', 'p5', 'p3', 'p1', 'p4'];
  const scene = new BoardScene();
  scene.snap(playingView(players), players[0]!);
  const styles = getComputedStyle(document.documentElement);

  players.forEach((id, index) => {
    const cssColor = styles.getPropertyValue(`--player-${index + 1}`).trim();
    expect(cssColor).toMatch(/^#[\da-f]{6}$/i);
    expect(scene.tokens.children[index]).toMatchObject({
      label: `token-${id}`,
      context: { instructions: expect.arrayContaining([
        expect.objectContaining({ action: 'fill', data: expect.objectContaining({
          style: expect.objectContaining({ color: Number.parseInt(cssColor.slice(1), 16) }),
        }) }),
      ]) },
    });
  });
});

it('keeps unchanged marker graphics while updating another property', () => {
  const scene = new BoardScene();
  const view = playingView(['a', 'b']);
  const id = view.board!.cells[1]!.asset!.assetId;
  const owned = { ...view, owners: { [id]: view.players[0]!.id }, houses: { [id]: 1 } };
  scene.snap(owned, 'a');
  const border = scene.ownership.children[0];
  const firstCell = scene.cells.children[1];
  scene.refreshOwnership({ ...owned, houses: { [id]: 2 } });
  expect(scene.ownership.children[0]).toBe(border);
  expect(scene.cells.children[1]).toBe(firstCell);
  expect(scene.housing.children).toHaveLength(2);
});

it('keeps the house pips clear of the price strips and company names on every side', () => {
  const scene = new BoardScene();
  const view = playingView(['a', 'b']);
  const assets = view.board!.cells.filter(cell => cell.asset !== null);
  scene.snap({ ...view, houses: Object.fromEntries(assets.map(cell => [cell.asset!.assetId, 4])) }, 'a');

  for (const cell of assets) {
    const strip = cellStrip(cell.index, cellRect(cell.index, scene.size)).bounds;
    const name = scene.cells.children[cell.index]!.getChildByLabel('company-name')!.getBounds();
    expect(name.width).toBeGreaterThan(0);
    expect(name.height).toBeGreaterThan(0);
    const pips = scene.housing.children.filter(pip => pip.label.startsWith(`house-${cell.index}-`));
    expect(pips).toHaveLength(4);
    for (const pip of pips) {
      const bounds = pip.getBounds();
      const overlapsStrip = bounds.maxX > strip.x && bounds.minX < strip.x + strip.width
        && bounds.maxY > strip.y && bounds.minY < strip.y + strip.height;
      expect(overlapsStrip, `cell ${cell.index} price strip`).toBe(false);
      const overlapsName = bounds.maxX > name.minX && bounds.minX < name.maxX
        && bounds.maxY > name.minY && bounds.minY < name.maxY;
      expect(overlapsName, `cell ${cell.index} company name`).toBe(false);
    }
  }
});

it('skips rent and completes movement immediately with reduced motion', async () => {
  const clock = { animate: vi.fn(instant.animate) };
  const scene = new BoardScene(660, clock, boardTheme(), () => true);
  scene.snap(playingView(['a', 'b']), 'a');
  await scene.play({ kind: 'hop', playerId: 'a', cell: 3 });
  await scene.play({ kind: 'rentPayment', from: 'a', to: 'b', amount: 120 });
  expect(clock.animate.mock.calls.map(([ms]) => ms)).toEqual([0]);
  expect(within(token(scene, 'a'), cellRect(3, 660))).toBe(true);
});

it('an authoritative snap cancels an in-flight movement', async () => {
  let finish!: () => void;
  const clock: SceneClock = {
    animate(_ms, frame, cancelled) {
      return new Promise(resolve => {
        frame(0.5);
        finish = () => {
          if (cancelled()) return resolve(false);
          frame(1);
          resolve(true);
        };
      });
    },
  };
  const scene = new BoardScene(660, clock);
  scene.snap(playingView(['a', 'b']), 'a');
  const motion = scene.play({ kind: 'hop', playerId: 'a', cell: 1 });
  scene.snap(playingView(['a', 'b'], { positions: { a: 5, b: 2 } }), 'b');
  finish();
  await motion;
  expect(within(token(scene, 'a'), cellRect(5, 660))).toBe(true);
});
