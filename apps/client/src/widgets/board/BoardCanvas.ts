import { boardTheme, type BoardTheme } from '../../shared/config/index';
import { logoMonogram, logoUrl } from '../../shared/lib/index';
import { fitLabel, gradient, label, specialIcon, textWidth } from './paint';
import { loadLogoTexture } from './textures';
import { mountCellTooltip } from './tooltip';
import { formatMoney } from '../../shared/lib/index';
import { t } from '../../shared/i18n/index';
/**
 * PixiJS scene of the generated board: cells, tokens and dice.
 * It draws what it is told (the server view, animation steps) and keeps no
 * game state of its own. Vue reactivity does not reach in here.
 */
import { boardDisplayKey, cellDisplay } from './display';
import { Application, Container, Graphics, Rectangle, Sprite, type FillGradient, type Texture, type Text } from 'pixi.js';
import { CLASSIC_40 } from '@game/game-core';
import type { BoardView } from '../../entities/game/index';
export type { BoardView } from '../../entities/game/index';
import type { AnimationStep } from '../../entities/game/index';
import { BOARD_SIZE, cellRect, cellStrip, jailBox, jailVisitorSlot, tokenSlot, type Point, type Rect } from './layout';

export const DIE_MS = 600;
export const HOP_MS = 150;
export const JUMP_MS = 450;
export const BANNER_MS = 1300;
export const RENT_MS = 900;

const TOKEN_RADIUS = 6;
const MIN_LABEL_CELL_WIDTH = 44;
const DIE_SIZE = 54;

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

type HoverDetails = { bounds: Rect; name: string; price: string };
type TextureCache = (url: string) => Promise<Texture | null>;

interface Marker {
  owner: string | undefined;
  color: string | undefined;
  houses: number;
  mortgaged: boolean;
}

export class BoardScene {
  readonly root = new Container();
  /** One child per ring cell, in index order. */
  readonly cells = new Container();
  /** One child per player. */
  readonly tokens = new Container();
  readonly ownership = new Container<Graphics>();
  /** House markers, 1-4 per asset cell, from `view.houses`. */
  readonly housing = new Container<Graphics>();
  /** Mortgage markers, one per mortgaged asset cell, from `view.mortgages`. */
  readonly mortgages = new Container<Graphics>();
  private boardKey = '';
  private compact = false;
  private requestRender: (() => void) | null = null;
  private readonly detailLabels: Text[] = [];
  private readonly markerByCell = new Map<number, Marker>();
  private readonly gradients = new Map<string, FillGradient>();
  private hover: ((details: HoverDetails | null) => void) | null = null;
  private selectAsset: ((index: number) => void) | null = null;
  /** The marker of the jail cell's "in jail" box. */
  readonly jailMarker = new Graphics();

  private readonly tokenById = new Map<string, Graphics>();
  private readonly slotById = new Map<string, number>();
  private readonly dice: readonly [Graphics, Graphics] = [new Graphics(), new Graphics()];
  private readonly diceLabel: Text;
  private readonly banner: Text;
  private readonly activeRing = new Graphics();
  private activeId: string | null = null;
  private nameOf: (playerId: string) => string = (id) => id;
  /** Bumped by `snap`; a step that started before it stops moving things. */
  private epoch = 0;

  constructor(
    readonly size: number = BOARD_SIZE,
    private readonly clock: SceneClock = frameClock,
    readonly theme: BoardTheme = boardTheme(),
    private readonly reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
    private textureCache?: TextureCache,
  ) {
    const ring = CLASSIC_40;
    this.diceLabel = label('', 16, theme.text, theme.ui);
    this.banner = label('', 17, theme.text, theme.ui, true);
    this.root.addChild(new Graphics().rect(0, 0, size, size).fill(theme.board));
    if (theme.frame.length > 1) {
      this.root.addChild(new Graphics().roundRect(0, 0, size, size, theme.radius)
        .fill(this.getGradient('frame', theme.frame, 'diagonal')));
    }

    this.root.addChild(this.cells, this.ownership, this.housing, this.mortgages);

    const jb = jailBox(cellRect(ring.jailCell, size));
    this.jailMarker.rect(jb.x, jb.y, jb.width, jb.height).fill({ color: theme.paper, alpha: 0.3 }).stroke({ width: 1, color: theme.mutedInk, alpha: 0.5 });
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

    this.activeRing.circle(0, 0, TOKEN_RADIUS + 4).stroke({ width: 2, color: this.theme.active });
    this.activeRing.visible = false;
    this.root.addChild(this.tokens, this.activeRing);
  }

  /** Apply only changed display values, independently of queued movement. */
  refreshOwnership(view: BoardView): void {
    this.hover?.(null);
    this.renderBoard(view.board);
    const players = new Map(view.players.map(({ id }, index) => [id, this.theme.players[index]]));
    for (const cell of view.board?.cells ?? []) {
      if (cell.asset === null) continue;
      const { index, asset: { assetId } } = cell;
      const owner = view.owners[assetId];
      const color = owner === undefined ? undefined : players.get(owner);
      const count = view.houses[assetId] ?? 0;
      const houses = Number.isInteger(count) ? Math.max(0, Math.min(count, 4)) : 0;
      const mortgaged = Object.hasOwn(view.mortgages ?? {}, assetId);
      const previous = this.markerByCell.get(index);
      const bounds = cellRect(index, this.size);

      if (previous?.owner !== owner || previous?.color !== color) {
        this.removeMarkers(this.ownership, index);
        if (color !== undefined) {
          const border = new Graphics().roundRect(bounds.x + 3, bounds.y + 3, bounds.width - 6, bounds.height - 6, this.theme.radius)
            .stroke({ width: 3, color });
          this.addMarker(this.ownership, border, index, `owner-${index}-${owner}`);
        }
      }
      if ((previous?.houses ?? 0) !== houses) {
        this.removeMarkers(this.housing, index);
        for (let pip = 0; pip < houses; pip++) {
          const marker = new Graphics().circle(bounds.x + 9 + pip * 8, bounds.y + bounds.height - 6, 2.7)
            .fill(this.theme.house).stroke({ color: this.theme.paper, width: 0.8 });
          this.addMarker(this.housing, marker, index, `house-${index}-${pip + 1}`);
        }
      }
      if ((previous?.mortgaged ?? false) !== mortgaged) {
        this.removeMarkers(this.mortgages, index);
        if (mortgaged) this.drawMortgage(index, bounds);
      }
      this.markerByCell.set(index, { owner, color, houses, mortgaged });
    }
    this.requestRender?.();
  }

  private readonly markerIndex = new WeakMap<Graphics, number>();

  private removeMarkers(layer: Container<Graphics>, index: number): void {
    for (const child of [...layer.children]) {
      if (this.markerIndex.get(child) === index) child.destroy();
    }
  }

  private addMarker(layer: Container<Graphics>, marker: Graphics, index: number, name: string): void {
    marker.label = name;
    this.markerIndex.set(marker, index);
    layer.addChild(marker);
  }

  private drawMortgage(index: number, bounds: Rect): void {
    const { x, y, width } = bounds;
    const inset = 4;
    const side = width - inset * 2;
    const hatch = new Graphics().roundRect(x + inset, y + inset, side, side, 3)
      .fill({ color: this.theme.inset, alpha: 0.45 });
    for (let offset = 5; offset < side * 2; offset += 8) {
      const first = Math.max(0, offset - side);
      const last = Math.min(side, offset);
      hatch.moveTo(x + inset + first, y + inset + offset - first)
        .lineTo(x + inset + last, y + inset + offset - last);
    }
    hatch.stroke({ color: this.theme.mortgage[0] ?? this.theme.edge, width: 2, alpha: 0.75 });
    this.addMarker(this.mortgages, hatch, index, `mortgage-${index}`);
  }

  setAssetSelection(callback: ((index: number) => void) | null): void {
    this.selectAsset = callback;
  }

  setHover(callback: ((details: HoverDetails | null) => void) | null): void {
    this.hover = callback;
  }

  setDisplayWidth(width: number): void {
    this.hover?.(null);
    const compact = width / 11 < MIN_LABEL_CELL_WIDTH;
    if (this.compact === compact) return;
    this.compact = compact;
    for (const text of this.detailLabels) text.visible = !compact;
    this.invalidateCells();
  }

  setRenderRequest(request: (() => void) | null): void {
    this.requestRender = request;
    if (request !== null) {
      this.textureCache = loadLogoTexture;
      this.cells.cacheAsTexture(true);
    }
  }

  invalidateCells(): void {
    this.cells.updateCacheTexture();
    this.requestRender?.();
  }

  private getGradient(key: string, colors: string[], direction?: Parameters<typeof gradient>[1]): FillGradient {
    let fill = this.gradients.get(key);
    if (fill === undefined) {
      fill = gradient(colors, direction);
      this.gradients.set(key, fill);
    }
    return fill;
  }

  private addDetail(box: Container, text: Text, x: number, y: number, maxWidth: number): void {
    text.position.set(x, y);
    fitLabel(text, maxWidth);
    text.visible = !this.compact;
    this.detailLabels.push(text);
    box.addChild(text);
  }

  private renderBoard(board: BoardView['board']): void {
    const key = boardDisplayKey(board);
    if (this.boardKey === key) return;
    this.boardKey = key;
    this.detailLabels.length = 0;
    this.markerByCell.clear();
    for (const layer of [this.cells, this.ownership, this.housing, this.mortgages]) {
      for (const child of layer.removeChildren()) child.destroy({ children: true });
    }

    for (const cell of board?.cells ?? []) {
      const bounds = cellRect(cell.index, this.size);
      const { x, y, width, height } = bounds;
      const { theme } = this;
      const box = new Container();
      box.label = `cell-${cell.index}`;
      const display = cellDisplay(cell);
      const special = theme.special(cell.kind);
      const surface = special.length === 2 ? this.getGradient(cell.kind, special, 'diagonal') : theme.cell;
      box.addChild(new Graphics().roundRect(x + 1, y + 1, width - 2, height - 2, theme.radius).fill(surface));
      const cx = x + width / 2;
      if (cell.asset !== null && display.group !== null && display.price !== null) {
        const colors = theme.group(display.group);
        const { bounds: strip, vertical, content } = cellStrip(cell.index, bounds);
        const groupFill = colors.length === 2 ? this.getGradient(display.group, colors) : theme.inset;
        const stripFill = vertical && colors.length === 2
          ? this.getGradient(`${display.group}-vertical`, colors, 'vertical')
          : groupFill;
        box.addChild(new Graphics().roundRect(strip.x, strip.y, strip.width, strip.height, 3).fill(stripFill));
        const price = label(display.price, 9, theme.ink, theme.ui, true);
        if (vertical) price.rotation = Math.PI / 2;
        this.addDetail(box, price, strip.x + strip.width / 2, strip.y + strip.height / 2, width - 12);
        const logoY = content.y - 2;
        const fallback = new Container();
        fallback.label = 'logo-fallback';
        fallback.position.set(content.x, logoY);
        fallback.addChild(
          new Graphics().roundRect(-11, -11, 22, 22, 5).fill(groupFill),
          label(logoMonogram(cell.asset.assetId), 10, theme.ink, theme.display, true),
        );
        box.addChild(fallback);
        const url = logoUrl(cell.asset.assetId, { dark: false });
        if (url !== null) void this.textureCache?.(url).then(texture => {
          if (texture === null || box.destroyed) return;
          const sprite = new Sprite(texture);
          sprite.label = 'company-logo';
          sprite.anchor.set(0.5);
          const scale = Math.min(30 / texture.width, 23 / texture.height);
          sprite.scale.set(scale);
          sprite.position.set(content.x, logoY);
          box.addChild(sprite);
          fallback.visible = false;
          this.invalidateCells();
        });

        this.addDetail(box, label(display.name, 9, theme.ink, theme.ui, true), content.x, content.y + 13, width - (vertical ? 18 : 9));
        box.hitArea = new Rectangle(x, y, width, height);
        box.eventMode = 'static';
        box.interactiveChildren = false;
        box.cursor = 'pointer';
        box.on('pointertap', () => { this.hover?.(null); this.selectAsset?.(cell.index); });
        const details = { bounds, name: display.name, price: display.price };
        box.on('pointerenter', event => { if (event.pointerType === 'mouse') this.hover?.(details); });
        box.on('pointerleave', () => this.hover?.(null));
      } else {
        const icon = specialIcon(cell.kind, theme);
        icon.position.set(cx, y + (cell.kind === 'jail' ? 15 : 23));
        box.addChild(icon);
        const title = label(display.name, 8, theme.ink, theme.display, true);
        title.position.set(cx, y + 40);
        fitLabel(title, width - 6);
        box.addChild(title);
      }
      this.cells.addChild(box);
    }
    this.invalidateCells();
  }

  destroy(): void {
    this.epoch++;
    this.root.destroy({ children: true });
    for (const fill of this.gradients.values()) fill.destroy();
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
      this.clock.animate(ms / Math.max(1, speed), (t) => {
        frame(t);
        this.requestRender?.();
      }, cancelled);

    switch (step.kind) {
      case 'highlight':
        this.setActive(step.playerId);
        return;
      case 'orderDie':
        this.diceLabel.text = t('board_canvas.order_roll', { player: this.nameOf(step.playerId) });
        this.dice[1].visible = false;
        await this.tumble([step.value], wait);
        return;
      case 'dice':
        this.diceLabel.text = t('board_canvas.dice_roll', { player: this.nameOf(step.playerId) });
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
        const lift = step.kind === 'hop' ? 11 : 18;
        const reduced = this.reduceMotion();
        await wait(reduced ? 0 : step.kind === 'hop' ? HOP_MS : JUMP_MS, (t) => {
          const travel = t * t * (3 - 2 * t);
          token.position.set(from.x + (to.x - from.x) * travel,
            from.y + (to.y - from.y) * travel - Math.sin(Math.PI * t) * lift);
          if (this.activeId === step.playerId) this.activeRing.position.copyFrom(token.position);
        });
        return;
      }
      case 'rentPayment': {
        const from = this.tokenById.get(step.from);
        const to = this.tokenById.get(step.to);
        if (from === undefined || to === undefined || this.reduceMotion()) return;
        const amount = label(formatMoney(step.amount), 15, this.theme.rent, this.theme.ui, true);
        const payment = new Container({ label: 'rent-payment' });
        const width = textWidth(amount) + 16;
        payment.addChild(new Graphics().roundRect(-width / 2, -12, width, 24, 12)
          .fill(this.theme.board).stroke({ color: this.theme.rent, width: 1 }), amount);
        const start = { x: from.x, y: from.y - 14 };
        const end = { x: to.x, y: to.y - 14 };
        payment.position.set(start.x, start.y);
        this.root.addChild(payment);
        try {
          await wait(RENT_MS, (t) => {
            payment.position.set(start.x + (end.x - start.x) * t, start.y + (end.y - start.y) * t - Math.sin(Math.PI * t) * 30);
            payment.alpha = Math.min(1, (1 - t) * 5);
          });
        } finally {
          if (!payment.destroyed) payment.destroy({ children: true });
          this.requestRender?.();
        }
        return;
      }
      case 'banner':
        this.banner.text = step.caption?.(this.nameOf(step.playerId)) ?? t('board_canvas.custom_banner', { player: this.nameOf(step.playerId), text: step.text });
        this.banner.visible = true;
        if (await wait(BANNER_MS)) this.banner.visible = false;
        return;
    }
  }

  private async tumble(values: readonly number[], wait: (ms: number, frame?: (t: number) => void) => Promise<boolean>): Promise<void> {
    values.forEach((_, i) => (this.dice[i]!.visible = true));
    // Cosmetic faces while tumbling; the settled faces are the event's values.
    const completed = await wait(DIE_MS, (t) => {
      const spin = Math.floor(t * 8);
      values.forEach((_, i) => this.drawDie(this.dice[i]!, ((spin + i * 2) % 6) + 1));
    });
    if (completed) values.forEach((value, i) => this.drawDie(this.dice[i]!, value));
  }

  private drawDie(die: Graphics, value: number): void {
    die.clear();
    die.roundRect(0, 0, DIE_SIZE, DIE_SIZE, 9).fill(this.theme.paper);
    const third = DIE_SIZE / 3;
    for (const [column, row] of PIPS[value] ?? []) {
      die.circle(third * (column + 0.5), third * (row + 0.5), 4.5).fill(this.theme.ink);
    }
  }

  private setActive(playerId: string | null): void {
    this.activeId = playerId;
    const token = playerId === null ? undefined : this.tokenById.get(playerId);
    this.activeRing.visible = token !== undefined && token.visible;
    if (token !== undefined) this.activeRing.position.copyFrom(token.position);
    this.requestRender?.();
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
        .fill(this.theme.players[index]!)
        .stroke({ width: 1.5, color: this.theme.board });
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
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  await app.init({
    width: scene.size,
    height: scene.size,
    background: scene.theme.board,
    antialias: pixelRatio < 2,
    autoStart: false,
    autoDensity: true,
    resolution: pixelRatio,
  });
  app.canvas.classList.add('board-canvas');
  app.canvas.dataset.testid = 'board-canvas';
  // autoDensity pins the canvas to a pixel size; let the page scale it instead.
  app.canvas.style.width = '100%';
  app.canvas.style.height = 'auto';
  await Promise.allSettled([
    document.fonts.load(`700 12px "${scene.theme.ui[0]}"`, 'AaАа'),
    document.fonts.load(`700 12px "${scene.theme.display[0]}"`, 'AaАа'),
  ]);
  host.appendChild(app.canvas);
  app.stage.addChild(scene.root);
  let renderFrame: number | null = null;
  const requestRender = () => {
    if (renderFrame !== null) return;
    renderFrame = requestAnimationFrame(() => {
      renderFrame = null;
      app.render();
    });
  };
  scene.setRenderRequest(requestRender);
  const resize = () => {
    const width = app.canvas.getBoundingClientRect().width;
    if (width === 0) return;
    scene.setDisplayWidth(width);
    // Preserve logical cell coordinates while drawing only the displayed pixels.
    const resolution = Math.min(width / scene.size, 1) * pixelRatio;
    if (app.renderer.resolution === resolution) return;
    app.renderer.resize(scene.size, scene.size, resolution);
    app.canvas.style.width = '100%';
    app.canvas.style.height = 'auto';
    scene.invalidateCells();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(app.canvas);
  resize();
  const disposeTooltip = mountCellTooltip(app.canvas, scene);
  requestRender();
  return () => {
    observer.disconnect();
    scene.setRenderRequest(null);
    if (renderFrame !== null) cancelAnimationFrame(renderFrame);
    disposeTooltip();
    app.stage.removeChild(scene.root);
    scene.destroy();
    app.destroy(true);
  };
}
