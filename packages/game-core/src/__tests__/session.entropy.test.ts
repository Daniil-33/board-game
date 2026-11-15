import { describe, it, expect } from 'vitest';
import { createSession, replay, type LogEntry } from '../session.js';
import { gameEngine } from '../rules.js';
import { entropy, type Entropy } from '../types.js';
import { cmd, ctx } from './helpers/fixtures.js';

const ent = (n: number): Entropy => entropy([n, n + 1, n + 2, n + 3]);

function playedSession() {
  const s = createSession(gameEngine);
  s.submit(cmd('CreateGame', { seed: 42, rulesVersion: 'core-3' }, { id: 'c1', rev: 0 }), ctx(1000, ent(10)));
  s.submit(cmd('AddPlayer', { playerId: 'a' }, { id: 'c2', rev: 1 }), ctx(2000, ent(20)));
  s.submit(cmd('AddPlayer', { playerId: 'b' }, { id: 'c3', rev: 2 }), ctx(3000, ent(30)));
  s.submit(cmd('StartGame', null, { id: 'c4', rev: 3 }), ctx(4000, ent(40)));
  return s;
}

describe('entropy in the session log', () => {
  it('records each accepted command’s context entropy', () => {
    const s = playedSession();
    expect(s.log.map((e) => e.entropy)).toEqual([ent(10), ent(20), ent(30), ent(40)]);
  });

  it('keeps a detached copy: mutating the caller’s entropy array does not change the log', () => {
    const s = createSession(gameEngine);
    const words = [5, 6, 7, 8] as unknown as Entropy; // a mutable, caller-owned array
    s.submit(cmd('CreateGame', { seed: 1, rulesVersion: 'core-3' }, { id: 'x', rev: 0 }), ctx(1, words));
    (words as unknown as number[])[0] = 999;
    expect(s.log[0]!.entropy).toEqual([5, 6, 7, 8]);
  });

  it('a duplicate delivery with fresh entropy returns the original result and leaves rng untouched', () => {
    const s = playedSession();
    const rngBefore = s.state.rng;
    const stateBefore = s.state;
    const r = s.submit(cmd('AddPlayer', { playerId: 'b' }, { id: 'c3', rev: 2 }), ctx(9999, ent(777)));
    expect(r.kind).toBe('accepted');
    expect(r.revision).toBe(3);
    expect(s.state).toBe(stateBefore);
    expect(s.state.rng).toBe(rngBefore);
    expect(s.log).toHaveLength(4);
  });

  it('replay reproduces the final state including rng', () => {
    const s = playedSession();
    const r = replay(gameEngine, s.log);
    expect(r.state).toEqual(s.state);
    expect(r.state.rng).toEqual(s.state.rng);
  });

  it('altering the entropy of the AddPlayer entry changes the replayed rng', () => {
    const s = playedSession();
    const log = JSON.parse(JSON.stringify(s.log)) as LogEntry[];
    log[1] = { ...log[1]!, entropy: entropy([0, 0, 0, 1]) };
    const r = replay(gameEngine, log);
    expect(r.state.rng).not.toEqual(s.state.rng);
  });
});
