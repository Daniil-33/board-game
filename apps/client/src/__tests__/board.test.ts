import { describe, expect, it } from 'vitest';
import { CLASSIC_40 } from '@game/game-core';
import { BoardScene, type SceneClock } from '../widgets/board/index';
import { cellRect, jailBox } from '../widgets/board/index';
import { playingView, setupView } from './helpers';

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
    expect(scene.cells.children[1]!.children).toHaveLength(5);
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
