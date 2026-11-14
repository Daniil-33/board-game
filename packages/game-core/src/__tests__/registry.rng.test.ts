import { describe, it, expect } from 'vitest';
import { createEngine, ok, fail, type CommandRegistry } from '../registry.js';
import { nextIntInclusive, type RngState } from '../rng.js';
import { InvariantViolationError } from '../invariants.js';
import { cmd, ctx, lobbyState, pid, deepFreeze } from './helpers/fixtures.js';

const registry: CommandRegistry = {
  // Draws a die, then rejects: the draw must not leak.
  DRAW_THEN_REJECT: {
    allowedActors: ['system'],
    allowedPhases: ['lobby'],
    handle: (s) => {
      nextIntInclusive(s.rng as RngState, 1, 6);
      return fail('NOPE', 'rejected after drawing');
    },
  },
  // Draws two values, threads the RNG into the returned state, reports both.
  DRAW_TWICE: {
    allowedActors: ['system'],
    allowedPhases: ['lobby'],
    handle: (s) => {
      const [a, r1] = nextIntInclusive(s.rng as RngState, 0, 2 ** 32 - 1);
      const [b, r2] = nextIntInclusive(r1, 0, 2 ** 32 - 1);
      return ok({ ...s, rng: r2 }, [{ type: 'DREW', payload: { a, b } }]);
    },
  },
  // Produces a broken state.
  DUPLICATE_PLAYERS: {
    allowedActors: ['system'],
    allowedPhases: ['lobby'],
    handle: (s) => ok({ ...s, players: [{ id: pid('a') }, { id: pid('a') }] }, []),
  },
};

const engine = createEngine(registry);
const REV = 3;

describe('randomness through the engine', () => {
  it('a handler that draws and rejects leaves rng reference-equal', () => {
    const s = deepFreeze(lobbyState(REV));
    const r = engine.execute(s, cmd('DRAW_THEN_REJECT', null, { rev: REV }), ctx());
    expect(r.kind).toBe('rejected');
    expect(r.state).toBe(s);
    expect(r.state.rng).toBe(s.rng);
  });

  it('a handler that draws twice gets distinct values and returns the advanced rng', () => {
    const s = deepFreeze(lobbyState(REV));
    const r = engine.execute(s, cmd('DRAW_TWICE', null, { rev: REV }), ctx());
    expect(r.kind).toBe('accepted');
    const { a, b } = r.events[0]!.payload as { a: number; b: number };
    expect(a).not.toBe(b);
    expect(r.state.rng).not.toEqual(s.rng);
  });

  it('same (state, command, ctx) twice gives deep-equal results', () => {
    const s = deepFreeze(lobbyState(REV));
    const c = cmd('DRAW_TWICE', null, { rev: REV });
    expect(engine.execute(s, c, ctx())).toEqual(engine.execute(s, c, ctx()));
  });
});

describe('invariant enforcement', () => {
  it('a handler returning duplicate players makes execute throw', () => {
    const s = lobbyState(REV);
    expect(() => engine.execute(s, cmd('DUPLICATE_PLAYERS', null, { rev: REV }), ctx())).toThrow(
      InvariantViolationError,
    );
    try {
      engine.execute(s, cmd('DUPLICATE_PLAYERS', null, { rev: REV }), ctx());
    } catch (e) {
      expect((e as InvariantViolationError).invariant).toBe('unique-player-ids');
    }
  });
});
