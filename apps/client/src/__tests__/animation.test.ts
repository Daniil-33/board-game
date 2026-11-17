import { describe, expect, it } from 'vitest';
import { AnimationQueue, BACKLOG_SPEED, stepsForEvents, type AnimationStep } from '../game/animation';

const RING = 40;
const diceRolled = (dice: [number, number], playerId = 'a') => ({
  type: 'DiceRolled',
  payload: { turnId: 't1', playerId, dice, double: dice[0] === dice[1], auto: false },
});
const moved = (from: number, steps: number, playerId = 'a') => ({
  type: 'PlayerMoved',
  payload: { playerId, from, to: (from + steps) % RING, steps },
});

/** A player that records the order steps start and finish in, with manual completion. */
function manualPlayer() {
  const log: string[] = [];
  const speeds: number[] = [];
  let finish: (() => void) | null = null;
  const name = (s: AnimationStep): string => (s.kind === 'hop' || s.kind === 'jump' ? `${s.kind}:${s.cell}` : s.kind === 'rentPayment' ? `${s.kind}:${s.from}>${s.to}:${s.amount}` : `${s.kind}:${s.playerId}`);
  return {
    log,
    speeds,
    play(step: AnimationStep, speed: number): Promise<void> {
      log.push(`start ${name(step)}`);
      speeds.push(speed);
      return new Promise((resolve) => {
        finish = () => {
          log.push(`end ${name(step)}`);
          resolve();
        };
      });
    },
    /** Finish the running step and let the queue start the next one. */
    async finish(): Promise<void> {
      const f = finish;
      finish = null;
      f?.();
      await Promise.resolve();
      await Promise.resolve();
    },
    get busy() {
      return finish !== null;
    },
  };
}

async function drain(player: ReturnType<typeof manualPlayer>): Promise<void> {
  while (player.busy) await player.finish();
}

describe('events to steps', () => {
  it('roll then move: dice first, then cell by cell with wrap after 39', () => {
    expect(stepsForEvents([diceRolled([3, 4]), moved(38, 7)], RING)).toEqual([
      { kind: 'dice', playerId: 'a', dice: [3, 4] },
      ...[39, 0, 1, 2, 3, 4, 5].map((cell) => ({ kind: 'hop', playerId: 'a', cell })),
    ]);
  });

  it('third double: straight to jail, no walk', () => {
    const steps = stepsForEvents(
      [diceRolled([1, 1]), { type: 'SentToJail', payload: { playerId: 'a', from: 12, to: 10 } }],
      RING,
    );
    expect(steps).toEqual([
      { kind: 'dice', playerId: 'a', dice: [1, 1] },
      { kind: 'jump', playerId: 'a', cell: 10 },
    ]);
  });

  it('shows the order die and highlights the player whose roll or turn began', () => {
    expect(
      stepsForEvents(
        [
          { type: 'OrderDieRolled', payload: { playerId: 'a', value: 4, auto: false } },
          { type: 'OrderRollStarted', payload: { setupRollId: 's2', playerId: 'b', deadline: 1 } },
          { type: 'TurnStarted', payload: { turnId: 't3', playerId: 'c', deadline: 1, bonus: false } },
        ],
        RING,
      ),
    ).toEqual([
      { kind: 'orderDie', playerId: 'a', value: 4 },
      { kind: 'highlight', playerId: 'b' },
      { kind: 'highlight', playerId: 'c' },
    ]);
  });

  it('jail events become banners marked as the interim rule', () => {
    const steps = stepsForEvents(
      [
        { type: 'InterimJailAttemptFailed', payload: { playerId: 'a', attemptsUsed: 1 } },
        { type: 'InterimJailReleased', payload: { playerId: 'a', reason: 'double' } },
      ],
      RING,
    );
    expect(steps.map((s) => s.kind)).toEqual(['banner', 'banner']);
    for (const step of steps) expect(step.kind === 'banner' && step.text).toContain('interim rule');
  });

  it('skips unknown event types and malformed payloads without throwing', () => {
    const events = [
      { type: 'SomethingNew', payload: { playerId: 'a' } },
      { type: 'TurnEnded', payload: { turnId: 't1', playerId: 'a', reason: 'end-turn' } },
      { type: 'DiceRolled', payload: null },
      { type: 'DiceRolled', payload: { playerId: 'a', dice: [7, 1] } },
      { type: 'PlayerMoved', payload: { playerId: 'a', from: 99, to: 1, steps: 2 } },
      { type: 'PlayerMoved', payload: { playerId: 'a', from: 1, to: 1, steps: 4000 } },
      { type: 'SentToJail', payload: { playerId: 'a', from: 1, to: 'jail' } },
      { type: 'OrderDieRolled', payload: 'x' },
    ];
    expect(stepsForEvents(events, RING)).toEqual([]);
  });
});

describe('animation queue', () => {
  it('finishes the dice step before the token moves', async () => {
    const player = manualPlayer();
    const queue = new AnimationQueue(RING, player.play, () => {});
    queue.enqueue([diceRolled([1, 2]), moved(0, 3)]);
    expect(player.log).toEqual(['start dice:a']);
    await player.finish();
    expect(player.log).toEqual(['start dice:a', 'end dice:a', 'start hop:1']);
    await drain(player);
    expect(player.log.filter((l) => l.startsWith('start hop'))).toEqual(['start hop:1', 'start hop:2', 'start hop:3']);
  });

  it('plays every step of the first update before any step of the second', async () => {
    const player = manualPlayer();
    let idle = 0;
    const queue = new AnimationQueue(RING, player.play, () => idle++);
    queue.enqueue([diceRolled([1, 1], 'a'), moved(0, 2, 'a')]);
    queue.enqueue([diceRolled([2, 1], 'b'), moved(5, 3, 'b')]);
    await drain(player);
    expect(player.log.filter((l) => l.startsWith('start'))).toEqual([
      'start dice:a',
      'start hop:1',
      'start hop:2',
      'start dice:b',
      'start hop:6',
      'start hop:7',
      'start hop:8',
    ]);
    // One step at a time: every start is followed by its own end.
    for (let i = 0; i < player.log.length; i += 2) {
      expect(player.log[i + 1]).toBe(player.log[i]!.replace('start', 'end'));
    }
    expect(idle).toBe(1);
    expect(queue.idle).toBe(true);
  });

  it('clear drops the waiting steps', async () => {
    const player = manualPlayer();
    let idle = 0;
    const queue = new AnimationQueue(RING, player.play, () => idle++);
    queue.enqueue([diceRolled([1, 2]), moved(0, 3)]);
    queue.clear();
    await drain(player);
    expect(player.log).toEqual(['start dice:a', 'end dice:a']);
    expect(idle).toBe(1);
  });

  it('reports idle at once for an update without steps', () => {
    let idle = 0;
    const queue = new AnimationQueue(RING, () => Promise.resolve(), () => idle++);
    queue.enqueue([{ type: 'TurnEnded', payload: { turnId: 't', playerId: 'a', reason: 'end-turn' } }]);
    expect(idle).toBe(1);
  });

  it('a failing step does not stall the queue', async () => {
    const played: string[] = [];
    const queue = new AnimationQueue(
      RING,
      (step) => {
        played.push(step.kind);
        return step.kind === 'dice' ? Promise.reject(new Error('boom')) : Promise.resolve();
      },
      () => {},
    );
    queue.enqueue([diceRolled([1, 2]), moved(0, 2)]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(played).toEqual(['dice', 'hop', 'hop']);
  });

  it('plays a long backlog faster', async () => {
    const player = manualPlayer();
    const queue = new AnimationQueue(RING, player.play, () => {});
    queue.enqueue([moved(0, 12), moved(12, 12)]);
    await drain(player);
    expect(player.speeds[0]).toBe(BACKLOG_SPEED);
    expect(player.speeds[player.speeds.length - 1]).toBe(1);
  });
});
