/**
 * PixiJS scene of the stage 1 board: the placeholder ring, tokens and dice.
 * It draws what it is told (the server view, animation steps) and keeps no
 * game state of its own. Vue reactivity does not reach in here.
 */
import { Application, Container, Graphics, Text } from 'pixi.js';
import { CLASSIC_40 } from '@game/game-core';
import type { StateView } from '@game/game-core';
import type { AnimationStep } from '../game/animation';
import { cellRect, jailBox, jailVisitorSlot, tokenSlot, type Point } from './layout';

export const BOARD_SIZE = 660;
export const PLACEHOLDER_CAPTION = 'PLACEHOLDER BOARD (stage 2 replaces it)';

/** Token colours by index in `view.players` (at most six players). */
export const TOKEN_COLORS = [0xe4572e, 0x29a3a3, 0xf3a712, 0x7d5ba6, 0x5aa02c, 0xd6589f] as const;

export const DIE_MS = 600;
export const HOP_MS = 150;
export const JUMP_MS = 450;
export const BANNER_MS = 1300;

const TOKEN_RADIUS = 7;
const DIE_SIZE = 54;
const COLORS = {
  board: 0x14202b,
  cell: 0x22384a,
  cellEdge: 0x3d5a73,
  start: 0x2e6b4a,
  jail: 0x6b3a2e,
  jailBox: 0x3a1f18,
  text: 0xdbe6ee,
  muted: 0x8fa5b5,
  die: 0xf5f1e6,
  pip: 0x1b2630,
  active: 0xffffff,
};

/** Pip positions (in thirds of the die face) for each die value. */
const PIPS: Readonly<Record<number, readonly (readonly [number, number])[]>> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [2, 0], [0, 2], [2, 2]],
  5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
};

/** The slice of the view the board draws. */
export type BoardView = Pick<StateView, 'players' | 'positions' | 'jail' | 'eliminated'>;

export interface SceneClock {
  /** Run `frame(t)` with t from 0 to 1 over `ms`; resolves early (false) when `cancelled()` turns true. */
  animate(ms: number, frame: (t: number) => void, cancelled: () => boolean): Promise<boolean>;
}

/** Animation driven by `requestAnimationFrame`. */
export const frameClock: SceneClock = {
  animate(ms, frame, cancelled) {
    return new Promise((resolve) => {
      const start = performance.now();
      const tick = (): void => {
        if (cancelled()) return resolve(false);
        const t = ms <= 0 ? 1 : Math.min(1, (performance.now() - start) / ms);
        frame(t);
        if (t >= 1) resolve(true);
        else requestAnimationFrame(tick);
      };
      tick();
    });
  },
};

function label(text: string, size: number, color: number, bold = false): Text {
  return new Text({
    text,
    style: { fontFamily: 'system-ui, sans-serif', fontSize: size, fill: color, fontWeight: bold ? '700' : '400', align: 'center' },
  });
}

export class BoardScene {
  readonly root = new Container();
  /** One child per ring cell, in index order. */
  readonly cells = new Container();
  /** One child per player. */
  readonly tokens = new Container();
  readonly caption: Text;
  /** The marker of the jail cell's "in jail" box. */
  readonly jailMarker = new Graphics();

  private readonly tokenById = new Map<string, Graphics>();
  private readonly slotById = new Map<string, number>();
  private readonly dice: readonly [Graphics, Graphics] = [new Graphics(), new Graphics()];
  private readonly diceLabel = label('', 16, COLORS.text);
  private readonly banner = label('', 17, COLORS.text, true);
  private readonly activeRing = new Graphics();
  private activeId: string | null = null;
  private nameOf: (playerId: string) => string = (id) => id;
  /** Bumped by `snap`; a step that started before it stops moving things. */
  private epoch = 0;

  constructor(
    private readonly size: number = BOARD_SIZE,
    private readonly clock: SceneClock = frameClock,
  ) {
    const ring = CLASSIC_40;
    this.root.addChild(new Graphics().rect(0, 0, size, size).fill(COLORS.board));

    for (const cell of ring.cells) {
      const r = cellRect(cell.index, size);
      const box = new Container();
      box.label = `cell-${cell.index}`;
      const fill = cell.kind === 'start' ? COLORS.start : cell.kind === 'jail' ? COLORS.jail : COLORS.cell;
      box.addChild(
        new Graphics().rect(r.x + 1, r.y + 1, r.width - 2, r.height - 2).fill(fill).stroke({ width: 1, color: COLORS.cellEdge }),
      );
      const title = cell.kind === 'start' ? 'START' : cell.kind === 'jail' ? 'JAIL' : String(cell.index);
      const text = label(title, 10, cell.kind !== 'start' && cell.kind !== 'jail' ? COLORS.muted : COLORS.text, cell.kind === 'start' || cell.kind === 'jail');
      // The jail cell's title sits under the "in jail" box, clear of it.
      if (cell.kind === 'jail') text.position.set(r.x + 4, r.y + r.height * 0.5);
      else text.position.set(r.x + 4, r.y + 3);
      box.addChild(text);
      this.cells.addChild(box);
    }
    this.root.addChild(this.cells);

    const jb = jailBox(cellRect(ring.jailCell, size));
    this.jailMarker.rect(jb.x, jb.y, jb.width, jb.height).fill(COLORS.jailBox).stroke({ width: 1, color: COLORS.cellEdge });
    this.jailMarker.label = 'jail-box';
    this.root.addChild(this.jailMarker);

    const centre = size / 2;
    this.caption = label(PLACEHOLDER_CAPTION, 18, COLORS.muted, true);
    this.caption.anchor.set(0.5);
    this.caption.position.set(centre, centre - 150);
    this.root.addChild(this.caption);

    this.dice[0].position.set(centre - DIE_SIZE - 8, centre - DIE_SIZE / 2);
    this.dice[1].position.set(centre + 8, centre - DIE_SIZE / 2);
    this.dice[0].visible = false;
    this.dice[1].visible = false;
    this.diceLabel.anchor.set(0.5);
    this.diceLabel.position.set(centre, centre + DIE_SIZE / 2 + 22);
    this.banner.anchor.set(0.5);
    this.banner.position.set(centre, centre + DIE_SIZE / 2 + 62);
    this.banner.visible = false;
    this.root.addChild(this.dice[0], this.dice[1], this.diceLabel, this.banner);

    this.activeRing.circle(0, 0, TOKEN_RADIUS + 4).stroke({ width: 2, color: COLORS.active });
    this.activeRing.visible = false;
    this.root.addChild(this.tokens, this.activeRing);
  }

  /** How player ids are shown in dice captions and banners. */
  setNames(nameOf: (playerId: string) => string): void {
    this.nameOf = nameOf;
  }

  /**
   * Put every token where the view says and mark `activeId`. Cancels a step in
   * flight, so the canvas can never drift from the server.
   */
  snap(view: BoardView, activeId: string | null): void {
    this.epoch++;
    this.banner.visible = false;
    this.syncTokens(view);
    view.players.forEach((player, index) => {
      const token = this.tokenById.get(player.id)!;
      token.visible = !view.eliminated.includes(player.id);
      const at = this.placeOf(view, player.id, index);
      token.position.set(at.x, at.y);
    });
    this.setActive(activeId !== null && view.eliminated.some((id) => id === activeId) ? null : activeId);
  }

  /** Play one animation step; resolves when it has finished or was cancelled by `snap`. */
  async play(step: AnimationStep, speed = 1): Promise<void> {
    const epoch = this.epoch;
    const cancelled = (): boolean => epoch !== this.epoch;
    const wait = (ms: number, frame: (t: number) => void = () => {}): Promise<boolean> =>
      this.clock.animate(ms / Math.max(1, speed), frame, cancelled);

    switch (step.kind) {
      case 'highlight':
        this.setActive(step.playerId);
        return;
      case 'orderDie':
        this.diceLabel.text = `${this.nameOf(step.playerId)} rolls for order`;
        this.dice[1].visible = false;
        await this.tumble([step.value], wait);
        return;
      case 'dice':
        this.diceLabel.text = `${this.nameOf(step.playerId)} rolls`;
        await this.tumble(step.dice, wait);
        return;
      case 'hop':
      case 'jump': {
        const token = this.tokenById.get(step.playerId);
        if (token === undefined || !token.visible) return;
        const slot = this.slotById.get(step.playerId) ?? 0;
        const rect = cellRect(step.cell, this.size);
        // A jump is only ever to jail, into the box; a walking token passes the jail cell as a visitor.
        const to =
          step.kind === 'jump'
            ? tokenSlot(jailBox(rect), slot)
            : step.cell === CLASSIC_40.jailCell
              ? jailVisitorSlot(rect, slot)
              : tokenSlot(rect, slot);
        const from = { x: token.x, y: token.y };
        const lift = step.kind === 'hop' ? 8 : 0;
        await wait(step.kind === 'hop' ? HOP_MS : JUMP_MS, (t) => {
          token.position.set(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t - Math.sin(Math.PI * t) * lift);
          if (this.activeId === step.playerId) this.activeRing.position.copyFrom(token.position);
        });
        return;
      }
      case 'banner':
        this.banner.text = `${this.nameOf(step.playerId)} ${step.text}`;
        this.banner.visible = true;
        if (await wait(BANNER_MS)) this.banner.visible = false;
        return;
    }
  }

  private async tumble(values: readonly number[], wait: (ms: number, frame?: (t: number) => void) => Promise<boolean>): Promise<void> {
    values.forEach((_, i) => (this.dice[i]!.visible = true));
    // Cosmetic faces while tumbling; the settled faces are the event's values.
    await wait(DIE_MS, (t) => {
      const spin = Math.floor(t * 8);
      values.forEach((_, i) => this.drawDie(this.dice[i]!, ((spin + i * 2) % 6) + 1));
    });
    values.forEach((value, i) => this.drawDie(this.dice[i]!, value));
  }

  private drawDie(die: Graphics, value: number): void {
    die.clear();
    die.roundRect(0, 0, DIE_SIZE, DIE_SIZE, 9).fill(COLORS.die);
    const third = DIE_SIZE / 3;
    for (const [column, row] of PIPS[value] ?? []) {
      die.circle(third * (column + 0.5), third * (row + 0.5), 4.5).fill(COLORS.pip);
    }
  }

  private setActive(playerId: string | null): void {
    this.activeId = playerId;
    const token = playerId === null ? undefined : this.tokenById.get(playerId);
    this.activeRing.visible = token !== undefined && token.visible;
    if (token !== undefined) this.activeRing.position.copyFrom(token.position);
  }

  /** One token per player of the view, coloured by index. */
  private syncTokens(view: BoardView): void {
    const ids = new Set(view.players.map((p) => p.id as string));
    for (const [id, token] of this.tokenById) {
      if (ids.has(id)) continue;
      this.tokens.removeChild(token);
      token.destroy();
      this.tokenById.delete(id);
      this.slotById.delete(id);
    }
    view.players.forEach((player, index) => {
      this.slotById.set(player.id, index);
      if (this.tokenById.has(player.id)) return;
      const token = new Graphics()
        .circle(0, 0, TOKEN_RADIUS)
        .fill(TOKEN_COLORS[index % TOKEN_COLORS.length]!)
        .stroke({ width: 1.5, color: 0x0b1218 });
      token.label = `token-${player.id}`;
      this.tokenById.set(player.id, token);
      this.tokens.addChild(token);
    });
  }

  private placeOf(view: BoardView, playerId: string, index: number): Point {
    if (!Object.hasOwn(view.positions, playerId)) {
      // No position in the view yet (order roll): wait in the centre, off the ring.
      return { x: this.size / 2 + (index - (view.players.length - 1) / 2) * 26, y: this.size / 2 - 100 };
    }
    const cell = view.positions[playerId]!;
    // The view is not schema-checked on the wire; a cell off the ring is parked, not drawn.
    if (!Number.isInteger(cell) || cell < 0 || cell >= CLASSIC_40.size) return { x: this.size / 2, y: this.size / 2 - 100 };
    const rect = cellRect(cell, this.size);
    if (cell !== CLASSIC_40.jailCell) return tokenSlot(rect, index);
    return Object.hasOwn(view.jail, playerId) ? tokenSlot(jailBox(rect), index) : jailVisitorSlot(rect, index);
  }
}

/** Render `scene` into `host` with a PixiJS application. Returns the teardown. */
export async function mountBoard(host: HTMLElement, scene: BoardScene): Promise<() => void> {
  const app = new Application();
  await app.init({
    width: BOARD_SIZE,
    height: BOARD_SIZE,
    background: COLORS.board,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
  });
  app.canvas.classList.add('board-canvas');
  // autoDensity pins the canvas to a pixel size; let the page scale it instead.
  app.canvas.style.width = '100%';
  app.canvas.style.height = 'auto';
  host.appendChild(app.canvas);
  app.stage.addChild(scene.root);
  return () => {
    app.stage.removeChild(scene.root);
    app.destroy(true);
  };
}
