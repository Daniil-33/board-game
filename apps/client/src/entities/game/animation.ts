import { t } from '../../shared/i18n/index';
/**
 * Turns `Update.events` into animation steps and plays them strictly in the
 * order received. No PixiJS here: the queue is given a `play` function.
 * Steps only replay what an event states; nothing is decided locally.
 */
import type { GameEvent } from '@game/game-core';

export type AnimationStep =
  /** One order-roll die shows `value`. */
  | { readonly kind: 'orderDie'; readonly playerId: string; readonly value: number }
  /** Two dice tumble and settle on `dice`. */
  | { readonly kind: 'dice'; readonly playerId: string; readonly dice: readonly [number, number] }
  /** The token hops onto the next cell of its walk. */
  | { readonly kind: 'hop'; readonly playerId: string; readonly cell: number }
  /** The token goes straight to `cell` (jail), without walking the ring. */
  | { readonly kind: 'jump'; readonly playerId: string; readonly cell: number }
  /** A short note about `playerId`. */
  | { readonly kind: 'banner'; readonly playerId: string; readonly text: string }
  /** Mark the player whose roll or turn began. */
  | { readonly kind: 'highlight'; readonly playerId: string }
  /** A paid rent `amount` moves from the payer's token to the owner's. */
  | { readonly kind: 'rentPayment'; readonly from: string; readonly to: string; readonly amount: number };

/** Plays one step; resolves when it has finished. `speed` > 1 shortens it. */
export type StepPlayer = (step: AnimationStep, speed: number) => Promise<void>;

/** With more than this many steps waiting, the backlog plays faster. */
export const BACKLOG_STEPS = 20;
export const BACKLOG_SPEED = 4;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}
const isCell = (value: unknown, ringSize: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < ringSize;
const isDie = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 6;

/**
 * Steps for one event. Event payloads arrive unchecked from the wire, so a
 * payload of the wrong shape, like an unknown event type, yields no step.
 */
export function stepsForEvent(event: GameEvent, ringSize: number): AnimationStep[] {
  const p = record(event.payload);
  if (p === null) return [];
  if (event.type === 'RentPaid') {
    // Successful rent payments move the full amount between tokens.
    const { payerId, ownerId, amount } = p;
    if (typeof payerId !== 'string' || typeof ownerId !== 'string' || typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0) return [];
    return [{ kind: 'rentPayment', from: payerId, to: ownerId, amount }];
  }
  if (typeof p.playerId !== 'string') return [];
  const playerId = p.playerId;

  switch (event.type) {
    case 'OrderRollStarted':
    case 'TurnStarted':
      return [{ kind: 'highlight', playerId }];
    case 'OrderDieRolled':
      return isDie(p.value) ? [{ kind: 'orderDie', playerId, value: p.value }] : [];
    case 'DiceRolled': {
      const dice = p.dice;
      if (!Array.isArray(dice) || dice.length !== 2 || !isDie(dice[0]) || !isDie(dice[1])) return [];
      return [{ kind: 'dice', playerId, dice: [dice[0], dice[1]] }];
    }
    case 'PlayerMoved': {
      const { from, steps } = p;
      if (!isCell(from, ringSize) || typeof steps !== 'number' || !Number.isInteger(steps)) return [];
      if (steps < 1 || steps > ringSize) return [];
      const hops: AnimationStep[] = [];
      for (let i = 1; i <= steps; i++) hops.push({ kind: 'hop', playerId, cell: (from + i) % ringSize });
      return hops;
    }
    case 'SentToJail':
      return isCell(p.to, ringSize) ? [{ kind: 'jump', playerId, cell: p.to }] : [];
    case 'InterimJailAttemptFailed':
      return typeof p.attemptsUsed === 'number'
        ? [{ kind: 'banner', playerId, text: t('animation.stays_in_jail', { value0: p.attemptsUsed }) }]
        : [];
    case 'InterimJailReleased':
      return [
        {
          kind: 'banner',
          playerId,
          text: p.reason === 'double' ? t('animation.leaves_jail_on') : t('animation.leaves_jail_interim'),
        },
      ];
    default:
      return [];
  }
}

export function stepsForEvents(events: readonly GameEvent[], ringSize: number): AnimationStep[] {
  return events.flatMap((event) => stepsForEvent(event, ringSize));
}

/** FIFO of animation steps, played one at a time across updates. */
export class AnimationQueue {
  private readonly waiting: AnimationStep[] = [];
  private running = false;

  constructor(
    private readonly ringSize: number,
    private readonly play: StepPlayer,
    /** Called whenever the queue has drained: the scene snaps to the view. */
    private readonly onIdle: () => void,
  ) {}

  get idle(): boolean {
    return !this.running && this.waiting.length === 0;
  }

  /** Queue the steps of one update's events, in order. */
  enqueue(events: readonly GameEvent[]): void {
    this.waiting.push(...stepsForEvents(events, this.ringSize));
    if (!this.running) void this.pump();
  }

  /** Drop every waiting step (a `Welcome` replaced the view). The step in flight is the scene's to cancel. */
  clear(): void {
    this.waiting.length = 0;
  }

  private async pump(): Promise<void> {
    this.running = true;
    try {
      for (;;) {
        const step = this.waiting.shift();
        if (step === undefined) break;
        const speed = this.waiting.length >= BACKLOG_STEPS ? BACKLOG_SPEED : 1;
        try {
          await this.play(step, speed);
        } catch (error) {
          // A broken step must not stall the game screen.
          console.warn('[animation] step failed:', error);
        }
      }
    } finally {
      this.running = false;
    }
    this.onIdle();
  }
}
