import type { Timestamp } from '@game/game-core';
import { systemClock, type Clock } from '../context/clock.js';

/** Schedules deadline callbacks; injectable so tests drive time themselves. */
export interface TimerScheduler {
  /**
   * Call `fire` once, at or shortly after `at`; a time already in the past
   * means "as soon as possible", never synchronously. Returns a cancel function.
   */
  schedule(at: Timestamp, fire: () => void): () => void;
}

/** Longest delay `setTimeout` takes without overflowing to 1 ms. */
const MAX_DELAY_MS = 2 ** 31 - 1;

/**
 * `setTimeout` against `clock`. May fire slightly early or, for delays beyond
 * `MAX_DELAY_MS`, much too early: the room re-arms a timer that fires before
 * its deadline.
 */
export function createSystemScheduler(clock: Clock = systemClock): TimerScheduler {
  return {
    schedule(at, fire) {
      const delay = Math.min(Math.max(0, at - clock.now()), MAX_DELAY_MS);
      const handle = setTimeout(fire, delay);
      return () => clearTimeout(handle);
    },
  };
}
