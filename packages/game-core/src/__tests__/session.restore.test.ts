import { describe, it, expect } from 'vitest';
import { restoreSession, ReplayDivergenceError, type LogEntry } from '../session.js';
import { gameEngine } from '../rules.js';
import { playingGame } from './helpers/game.js';
import { DEFAULT_ENTROPY, ctx } from './helpers/fixtures.js';
import type { GameState } from '../state.js';

// spec: engine/session "Restore from snapshot and tail", "Restore divergence is reported"
function played() {
  const g = playingGame(['a', 'b', 'c']);
  const snapshots = new Map<number, GameState>([[g.state.revision, g.state]]);
  for (let i = 0; i < 12; i++) {
    g.roll(1 + (i % 6), 1 + ((i * 7 + 2) % 6));
    snapshots.set(g.state.revision, g.state);
    if (g.state.turn!.rolled) g.endTurn();
    snapshots.set(g.state.revision, g.state);
  }
  return { g, snapshots };
}
const clone = (log: readonly LogEntry[]) => JSON.parse(JSON.stringify(log)) as LogEntry[];

function expectDivergence(fn: () => unknown, index: number) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ReplayDivergenceError);
    expect((e as ReplayDivergenceError).index).toBe(index);
    return;
  }
  throw new Error('expected ReplayDivergenceError');
}

describe('restoreSession', () => {
  it('restored state equals the live state, and further commands give equal results', () => {
    const { g, snapshots } = played();
    for (const [rev, snap] of snapshots) {
      const restored = restoreSession(gameEngine, snap, g.session.log.slice(rev));
      expect(restored.state).toEqual(g.state);
    }
    const [rev, snap] = [...snapshots][3]!;
    const restored = restoreSession(gameEngine, snap, g.session.log.slice(rev));
    const next = g.rollDiceCmd();
    const at = g.now + 1;
    expect(restored.submit(next, ctx(at, DEFAULT_ENTROPY))).toEqual(g.session.submit(next, ctx(at, DEFAULT_ENTROPY)));
  });

  it('an empty tail gives the snapshot', () => {
    const { g } = played();
    expect(restoreSession(gameEngine, g.state, []).state).toEqual(g.state);
  });

  it('a tail that does not follow the snapshot diverges at index 0', () => {
    const { g, snapshots } = played();
    const [rev, snap] = [...snapshots][2]!;
    expectDivergence(() => restoreSession(gameEngine, snap, g.session.log.slice(rev + 1)), 0);
  });

  it('tampered events or entropy diverge at that entry', () => {
    const { g, snapshots } = played();
    const [rev, snap] = [...snapshots][1]!;
    const tail = clone(g.session.log.slice(rev));
    const evTampered = clone(tail);
    (evTampered[2] as unknown as { events: unknown[] }).events = [];
    expectDivergence(() => restoreSession(gameEngine, snap, evTampered), 2);
    const entTampered = clone(tail);
    const rollIdx = entTampered.findIndex((e) => e.command.type === 'RollDice');
    (entTampered[rollIdx] as unknown as { entropy: number[] }).entropy = [1, 2, 3, 4];
    expectDivergence(() => restoreSession(gameEngine, snap, entTampered), rollIdx);
  });
});
