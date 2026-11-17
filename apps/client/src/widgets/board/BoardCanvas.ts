import { formatMoney } from '../../shared/lib/index';
import { t } from '../../shared/i18n/index';
/**
 * PixiJS scene of the generated board: cells, tokens and dice.
 * It draws what it is told (the server view, animation steps) and keeps no
 * game state of its own. Vue reactivity does not reach in here.
 */
import { boardDisplayKey, cellDisplay } from './display';
import { Application, Container, Graphics, Text } from 'pixi.js';
import { CLASSIC_40 } from '@game/game-core';
import type { BoardView } from '../../entities/game/index';
export type { BoardView } from '../../entities/game/index';
import type { AnimationStep } from '../../entities/game/index';
import { cellRect, jailBox, jailVisitorSlot, tokenSlot, type Point } from './layout';

export const BOARD_SIZE = 660;

/** Token colours by index in `view.players` (at most six players). */
export const TOKEN_COLORS = [0xe4572e, 0x29a3a3, 0xf3a712, 0x7d5ba6, 0x5aa02c, 0xd6589f] as const;

export const DIE_MS = 600;
export const HOP_MS = 150;
export const JUMP_MS = 450;
export const BANNER_MS = 1300;
export const RENT_MS = 900;
/** House marker fill. */
export const HOUSE_COLOR = 0x7ee06a;
/** Mortgage marker colour: a cell frame and an "M" badge. */
export const MORTGAGE_COLOR = 0xffc857;

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
  readonly ownership = new Container();
  /** House markers, 1-4 per asset cell, from `view.houses`. */
  readonly housing = new Container();
  /** Mortgage markers, one per mortgaged asset cell, from `view.mortgages`. */
  readonly mortgages = new Container();
  private boardKey = '';
  private selectAsset: ((index: number) => void) | null = null;
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

    this.root.addChild(this.cells, this.ownership, this.housing, this.mortgages);

    const jb = jailBox(cellRect(ring.jailCell, size));
    this.jailMarker.rect(jb.x, jb.y, jb.width, jb.height).fill(COLORS.jailBox).stroke({ width: 1, color: COLORS.cellEdge });
    this.jailMarker.label = 'jail-box';
    this.root.addChild(this.jailMarker);

    const centre = size / 2;
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

  /** Redraw the view-driven cell layers (owners, houses and mortgages) without touching tokens or a step in flight. */
  refreshOwnership(view: BoardView): void {
    this.refreshHouses(view);
    this.refreshMortgages(view);
    for (const child of this.ownership.removeChildren()) child.destroy();
    for (const cell of view.board?.cells ?? []) {
      if (cell.asset === null) continue;
      const owner = view.owners[cell.asset.assetId];
      const index = view.players.findIndex(p => p.id === owner);
      if (index < 0) continue;
      const r = cellRect(cell.index, this.size);
      const marker = new Graphics().roundRect(r.x + r.width - 14, r.y + r.height - 14, 10, 10, 2)
        .fill(0xffffff).stroke({ width: 1, color: 0xffffff });
      marker.tint = TOKEN_COLORS[index % TOKEN_COLORS.length]!;
      marker.label = `owner-${cell.index}-${owner}`;
      this.ownership.addChild(marker);
    }
  }

  refreshMortgages(view: BoardView): void {
    for (const child of this.mortgages.removeChildren()) child.destroy();
    const mortgages = view.mortgages ?? {};
    for (const cell of view.board?.cells ?? []) {
      if (cell.asset === null || !Object.hasOwn(mortgages, cell.asset.assetId)) continue;
      const r = cellRect(cell.index, this.size);
      const marker = new Container();
      marker.addChild(new Graphics().rect(r.x + 1, r.y + 1, r.width - 2, r.height - 2).fill({ color: MORTGAGE_COLOR, alpha: 0.18 }).stroke({ width: 2, color: MORTGAGE_COLOR }));
      const mark = label(t('board_canvas.mortgage_marker'), 12, MORTGAGE_COLOR, true);
      mark.position.set(r.x + r.width - 16, r.y + 3);
      marker.addChild(mark);
      marker.label = `mortgage-${cell.index}`;
      this.mortgages.addChild(marker);
    }
  }

  refreshHouses(view: BoardView): void {
    for (const child of this.housing.removeChildren()) child.destroy();
    for (const cell of view.board?.cells ?? []) {
      if (cell.asset === null) continue;
      const count = view.houses[cell.asset.assetId] ?? 0;
      if (!Number.isInteger(count) || count < 1) continue;
      const r = cellRect(cell.index, this.size);
      for (let i = 0; i < Math.min(count, 4); i++) {
        const marker = new Graphics().rect(r.x + 4 + i * 11, r.y + r.height - 27, 9, 9).fill(HOUSE_COLOR).stroke({ width: 1, color: 0x0b1218 });
        marker.label = `house-${cell.index}-${i + 1}`;
        this.housing.addChild(marker);
      }
    }
  }

  setAssetSelection(callback: ((index: number) => void) | null): void {
    this.selectAsset = callback;
  }

  private renderBoard(board: BoardView['board']): void {
    const key = boardDisplayKey(board);
    if (this.boardKey === key) return;
    this.boardKey = key;
    for (const child of this.cells.removeChildren()) child.destroy({ children: true });
    for (const cell of board?.cells ?? []) {
      const r = cellRect(cell.index, this.size);
      const box = new Container();
      box.label = `cell-${cell.index}`;
      const display = cellDisplay(cell);
      box.addChild(new Graphics().rect(r.x + 1, r.y + 1, r.width - 2, r.height - 2)
        .fill(cell.kind === 'start' ? COLORS.start : COLORS.cell).stroke({ width: 1, color: COLORS.cellEdge }));
      if (display.color !== null) {
        box.addChild(new Graphics().rect(r.x + 2, r.y + 2, r.width - 4, 11).fill(display.color));
        const group = label(display.group!, 8, 0x101820, true);
        group.anchor.set(0.5, 0); group.position.set(r.x + r.width / 2, r.y + 2);
        box.addChild(group);
      }
      const title = label(display.name.length > 22 ? display.name.slice(0, 21) + '…' : display.name, 9, COLORS.text);
      title.style.wordWrap = true; title.style.breakWords = true; title.style.wordWrapWidth = r.width - 8;
      title.anchor.set(0.5, 0); title.position.set(r.x + r.width / 2, r.y + (cell.kind === 'jail' ? 33 : 15));
      box.addChild(title);
      if (display.price !== null) {
        const price = label(display.price, 9, COLORS.text, true);
        price.anchor.set(0.5, 0); price.position.set(r.x + r.width / 2, r.y + r.height - 13);
        box.addChild(price);
        box.eventMode = 'static'; box.cursor = 'pointer';
        box.on('pointertap', () => this.selectAsset?.(cell.index));
      }
      this.cells.addChild(box);
    }
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
    this.renderBoard(view.board);
    this.refreshOwnership(view);
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
        this.diceLabel.text = t('board_canvas.rolls_for_order', { value0: this.nameOf(step.playerId) });
        this.dice[1].visible = false;
        await this.tumble([step.value], wait);
        return;
      case 'dice':
        this.diceLabel.text = t('board_canvas.rolls', { value0: this.nameOf(step.playerId) });
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
      case 'rentPayment': {
        const from = this.tokenById.get(step.from);
        const to = this.tokenById.get(step.to);
        if (from === undefined || to === undefined) return;
        const amount = label(formatMoney(step.amount), 15, 0xffe08a, true);
        amount.anchor.set(0.5);
        amount.label = 'rent-payment';
        const start = { x: from.x, y: from.y - 14 };
        const end = { x: to.x, y: to.y - 14 };
        amount.position.set(start.x, start.y);
        this.root.addChild(amount);
        try {
          await wait(RENT_MS, (t) => amount.position.set(start.x + (end.x - start.x) * t, start.y + (end.y - start.y) * t - Math.sin(Math.PI * t) * 30));
        } finally {
          this.root.removeChild(amount);
          amount.destroy();
        }
        return;
      }
      case 'banner':
        this.banner.text = t('board_canvas.symbol', { value0: this.nameOf(step.playerId), value1: step.text });
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
