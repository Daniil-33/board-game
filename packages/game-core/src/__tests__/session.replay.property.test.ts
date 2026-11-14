import { describe, it, expect } from 'vitest';
import { createSession, replay } from '../session.js';
import { gameEngine } from '../lifecycle.js';
import { seedRng, nextIntInclusive, type RngState } from '../rng.js';
import type { GameCommand } from '../engine.js';
import { cmd, ctx, player } from './helpers/fixtures.js';

// Deterministic generator for the test itself (fixed test seed, no Math.random).
class Gen {
  constructor(private rng: RngState) {}
  int(lo: number, hi: number): number {
    const [v, next] = nextIntInclusive(this.rng, lo, hi);
    this.rng = next;
    return v;
  }
  pick<T>(xs: readonly T[]): T {
    return xs[this.int(0, xs.length - 1)]!;
  }
}

const PLAYER_IDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

function randomCommand(g: Gen, currentRevision: number, history: GameCommand[], seq: number): GameCommand {
  const roll = g.int(0, 99);

  // ~10%: resend an earlier command verbatim (duplicate delivery).
  if (roll < 10 && history.length > 0) return g.pick(history);

  // ~5%: reuse an earlier id with a different payload (conflict).
  if (roll < 15 && history.length > 0) {
    const prior = g.pick(history);
    return cmd('AddPlayer', { playerId: `conflict-${seq}` }, { id: prior.commandId, rev: currentRevision });
  }

  // Revision: mostly correct, sometimes stale or future.
  const revRoll = g.int(0, 9);
  const rev = revRoll === 0 ? Math.max(0, currentRevision - 1) : revRoll === 1 ? currentRevision + 1 : currentRevision;
  const actor = g.int(0, 9) === 0 ? player(g.pick(PLAYER_IDS)) : undefined;
  const id = `c${seq}`;
  const opts = actor ? { id, rev, actor } : { id, rev };

  switch (g.int(0, 6)) {
    case 0:
      return cmd('CreateGame', { seed: g.int(0, 2 ** 32 - 1), rulesVersion: g.int(0, 9) === 0 ? 'bad' : 'core-0' }, opts);
    case 1:
    case 2:
    case 3:
      return cmd('AddPlayer', { playerId: g.pick(PLAYER_IDS) }, opts);
    case 4:
      return cmd('StartGame', null, opts);
    case 5:
      return cmd('AddPlayer', { playerId: g.int(0, 1) === 0 ? '' : 42 }, opts); // malformed
    default:
      return cmd('Unknown', null, opts);
  }
}

describe('property: any command sequence replays to the identical session', () => {
  const g = new Gen(seedRng(20261114));
  const stats = { reachedSetup: 0, accepted: 0, duplicates: 0, conflicts: 0, rejected: 0 };

  for (let run = 0; run < 200; run++) {
    const length = g.int(1, 40);
    const commands: GameCommand[] = [];
    const times: number[] = [];

    // Generate the sequence up front against a live session so revisions are realistic.
    const live = createSession(gameEngine);
    let t = 1_767_225_600_000;
    for (let i = 0; i < length; i++) {
      const c = randomCommand(g, live.state.revision, commands, i);
      t += g.int(0, 5_000);
      commands.push(c);
      times.push(t);
      const logBefore = live.log.length;
      const r = live.submit(c, ctx(t)); // must never throw (no invariant violations)
      if (r.kind === 'accepted') {
        if (live.log.length === logBefore) stats.duplicates += 1;
        else stats.accepted += 1;
      } else if (r.error.code === 'COMMAND_ID_CONFLICT') stats.conflicts += 1;
      else stats.rejected += 1;
    }
    if (live.state.phase === 'setup') stats.reachedSetup += 1;

    it(`run ${run}: ${length} commands`, () => {
      const s = createSession(gameEngine);
      commands.forEach((c, i) => s.submit(c, ctx(times[i])));

      expect(s.state).toEqual(live.state);
      expect(s.state.revision).toBe(s.log.length);

      const replayed = replay(gameEngine, s.log);
      expect(replayed.state).toEqual(s.state);
      expect(replayed.log.map((e) => e.events)).toEqual(s.log.map((e) => e.events));
    });
  }

  it('generator covers the interesting paths', () => {
    expect(stats.reachedSetup).toBeGreaterThan(10);
    expect(stats.accepted).toBeGreaterThan(200);
    expect(stats.duplicates).toBeGreaterThan(10);
    expect(stats.conflicts).toBeGreaterThan(10);
    expect(stats.rejected).toBeGreaterThan(100);
  });
});
