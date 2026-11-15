import { timestamp, type Timestamp } from '@game/game-core';
import type { Clock } from '../../context/clock.js';
import type { TimerScheduler } from '../../timers/scheduler.js';

interface Timer {
  readonly at: number;
  readonly seq: number;
  readonly fire: () => void;
}

/**
 * A clock that moves only when told to, and the scheduler bound to it.
 * `advance` fires due timers synchronously in time order; a timer scheduled
 * for a time that has already passed fires on the next microtask.
 */
export class FakeClock implements Clock, TimerScheduler {
  private ms: number;
  private seq = 0;
  private readonly timers = new Set<Timer>();

  constructor(startMs: number) {
    this.ms = timestamp(startMs);
  }

  now(): Timestamp {
    return timestamp(this.ms);
  }

  schedule(at: Timestamp, fire: () => void): () => void {
    const timer: Timer = { at, seq: this.seq++, fire };
    this.timers.add(timer);
    if (at <= this.ms) {
      queueMicrotask(() => {
        if (this.timers.delete(timer)) timer.fire();
      });
    }
    return () => {
      this.timers.delete(timer);
    };
  }

  /** Due times of the armed timers, ascending. */
  get pending(): number[] {
    return [...this.timers].map((t) => t.at).sort((a, b) => a - b);
  }

  /** Move time forward by `ms`, firing every timer that becomes due, earliest first. */
  advance(ms: number): void {
    if (!Number.isSafeInteger(ms) || ms < 0) throw new RangeError(`advance needs a non-negative integer, got ${ms}`);
    const target = this.ms + ms;
    for (;;) {
      const due = [...this.timers].filter((t) => t.at <= target).sort((a, b) => a.at - b.at || a.seq - b.seq)[0];
      if (due === undefined) break;
      this.timers.delete(due);
      this.ms = Math.max(this.ms, due.at);
      due.fire();
    }
    this.ms = target;
  }

  /** Fire every armed timer now without moving time, as an early `setTimeout` would. */
  fireEarly(): void {
    const all = [...this.timers].sort((a, b) => a.at - b.at || a.seq - b.seq);
    for (const timer of all) {
      if (this.timers.delete(timer)) timer.fire();
    }
  }
}
