import { describe, it, expect } from 'vitest';
import { createSession, replay, ReplayDivergenceError, type LogEntry } from '../session.js';
import { gameEngine } from '../rules.js';
import { cmd, ctx } from './helpers/fixtures.js';

function playedSession() {
  const s = createSession(gameEngine);
  s.submit(cmd('CreateGame', { seed: 42, rulesVersion: 'core-6' }, { id: 'c1', rev: 0 }), ctx(1000));
  s.submit(cmd('AddPlayer', { playerId: 'a' }, { id: 'c2', rev: 1 }), ctx(2000));
  s.submit(cmd('AddPlayer', { playerId: 'a' }, { id: 'c2b', rev: 2 }), ctx(2500)); // DUPLICATE_PLAYER, not logged
  s.submit(cmd('AddPlayer', { playerId: 'b' }, { id: 'c3', rev: 2 }), ctx(3000));
  s.submit(cmd('StartGame', null, { id: 'c4', rev: 3 }), ctx(4000));
  return s;
}

function clone(log: readonly LogEntry[]): LogEntry[] {
  return JSON.parse(JSON.stringify(log)) as LogEntry[];
}

function expectDivergence(fn: () => unknown, index: number, errorCode?: string) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ReplayDivergenceError);
    expect((e as ReplayDivergenceError).index).toBe(index);
    if (errorCode) expect((e as ReplayDivergenceError).errorCode).toBe(errorCode);
    return;
  }
  throw new Error('expected ReplayDivergenceError');
}

describe('replay', () => {
  it('reproduces state and per-entry events', () => {
    const original = playedSession();
    expect(original.log).toHaveLength(4);
    const replayed = replay(gameEngine, original.log);
    expect(replayed.state).toEqual(original.state);
    expect(replayed.state.phase).toBe('setup');
    expect(replayed.log.map((e) => e.events)).toEqual(original.log.map((e) => e.events));
  });

  it('works from a serialised (JSON round-tripped) log', () => {
    const original = playedSession();
    expect(replay(gameEngine, clone(original.log)).state).toEqual(original.state);
  });

  it('replayed session deduplicates logged command ids', () => {
    const original = playedSession();
    const replayed = replay(gameEngine, original.log);
    const r = replayed.submit(cmd('StartGame', null, { id: 'c4', rev: 3 }), ctx(9999));
    expect(r.kind).toBe('accepted');
    expect(r.revision).toBe(4);
    expect(replayed.log).toHaveLength(4);
  });

  it('replayed session continues identically to the original', () => {
    const a = playedSession();
    const b = replay(gameEngine, a.log);
    const next = cmd('StartGame', null, { id: 'c5', rev: 4 });
    expect(b.submit(next, ctx(5000))).toEqual(a.submit(next, ctx(5000)));
  });

  it('tampered events -> divergence at that index', () => {
    const log = clone(playedSession().log);
    (log[2] as { events: unknown }).events = [{ type: 'PlayerAdded', payload: { playerId: 'zzz' } }];
    expectDivergence(() => replay(gameEngine, log), 2);
  });

  it('tampered revision -> divergence at that index', () => {
    const log = clone(playedSession().log);
    (log[1] as { revision: number }).revision = 7;
    expectDivergence(() => replay(gameEngine, log), 1);
  });

  it('unsupported rules version -> divergence at index 0 with UNSUPPORTED_RULES_VERSION', () => {
    const log = clone(playedSession().log);
    (log[0]!.command.payload as { rulesVersion: string }).rulesVersion = 'core-999';
    expectDivergence(() => replay(gameEngine, log), 0, 'UNSUPPORTED_RULES_VERSION');
  });

  it('dropped entry -> divergence at the gap: the next entry does not follow the previous revision', () => {
    const log = clone(playedSession().log);
    log.splice(1, 1);
    expect(() => replay(gameEngine, log)).toThrow(/does not follow/);
    expectDivergence(() => replay(gameEngine, log), 1);
  });
});
