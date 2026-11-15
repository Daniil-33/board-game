import { describe, expect, it } from 'vitest';
import { timestamp } from '@game/game-core';
import { createSystemScheduler } from '../timers/scheduler.js';
import { FakeClock } from './helpers/fake-clock.js';

const at = (ms: number) => timestamp(ms);

describe('FakeClock', () => {
  it('fires due timers in time order and moves the clock to each', () => {
    const clock = new FakeClock(1000);
    const fired: string[] = [];
    clock.schedule(at(1300), () => fired.push(`late@${clock.now()}`));
    clock.schedule(at(1100), () => fired.push(`early@${clock.now()}`));
    clock.schedule(at(2000), () => fired.push('never'));
    clock.advance(299);
    expect(fired).toEqual(['early@1100']);
    clock.advance(1);
    expect(fired).toEqual(['early@1100', 'late@1300']);
    expect(clock.now()).toBe(1300);
    expect(clock.pending).toEqual([2000]);
  });

  it('a cancelled timer never fires', () => {
    const clock = new FakeClock(0);
    let fired = false;
    const cancel = clock.schedule(at(10), () => (fired = true));
    cancel();
    clock.advance(100);
    expect(fired).toBe(false);
    expect(clock.pending).toEqual([]);
  });

  it('an overdue timer fires on the next microtask without advancing', async () => {
    const clock = new FakeClock(500);
    let fired = 0;
    clock.schedule(at(100), () => fired++);
    expect(fired).toBe(0);
    await Promise.resolve();
    expect(fired).toBe(1);
    const cancel = clock.schedule(at(100), () => fired++);
    cancel();
    await Promise.resolve();
    expect(fired).toBe(1);
  });

  it('a timer armed while advancing fires in the same advance when due', () => {
    const clock = new FakeClock(0);
    const fired: number[] = [];
    clock.schedule(at(10), () => {
      fired.push(clock.now());
      clock.schedule(at(20), () => fired.push(clock.now()));
    });
    clock.advance(30);
    expect(fired).toEqual([10, 20]);
  });
});

describe('system scheduler', () => {
  it('fires after the delay to the deadline and can be cancelled', async () => {
    const clock = new FakeClock(1000);
    const scheduler = createSystemScheduler(clock);
    let fired = 0;
    await new Promise<void>((resolve) => {
      scheduler.schedule(at(1005), () => {
        fired++;
        resolve();
      });
    });
    const cancel = scheduler.schedule(at(900), () => fired++); // overdue: next tick
    cancel();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(fired).toBe(1);
  });
});
