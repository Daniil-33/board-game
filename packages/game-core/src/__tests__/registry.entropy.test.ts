import { describe, it, expect } from 'vitest';
import { createEngine, revisionGuard, ok, fail, type CommandRegistry } from '../registry.js';
import { nextIntInclusive, type RngState } from '../rng.js';
import { gameEngine } from '../rules.js';
import { genesis } from '../state.js';
import { entropy } from '../types.js';
import { cmd, ctx, lobbyState, deepFreeze } from './helpers/fixtures.js';

const E1 = entropy([1, 2, 3, 4]);
const E2 = entropy([1, 2, 3, 5]);

const registry: CommandRegistry = {
  DRAW_THEN_REJECT: {
    guard: revisionGuard,
    allowedActors: ['system'],
    allowedPhases: ['lobby'],
    handle: (s) => {
      nextIntInclusive(s.rng as RngState, 1, 6);
      return fail('NOPE', 'rejected after drawing');
    },
  },
  DRAW: {
    guard: revisionGuard,
    allowedActors: ['system'],
    allowedPhases: ['lobby'],
    handle: (s) => {
      const [v, rng] = nextIntInclusive(s.rng as RngState, 0, 2 ** 32 - 1);
      return ok({ ...s, rng }, [{ type: 'DREW', payload: { v } }]);
    },
  },
};
const engine = createEngine(registry);
const REV = 3;

describe('entropy absorption in the engine', () => {
  it('a non-drawing AddPlayer absorbs entropy: different entropy, different rng', () => {
    const s = deepFreeze(lobbyState(REV));
    const c = cmd('AddPlayer', { playerId: 'c' }, { rev: REV });
    const r1 = gameEngine.execute(s, c, ctx(undefined, E1));
    const r2 = gameEngine.execute(s, c, ctx(undefined, E2));
    expect(r1.kind).toBe('accepted');
    expect(r2.kind).toBe('accepted');
    expect(r1.state.rng).not.toEqual(r2.state.rng);
    expect(r1.state.rng).not.toEqual(s.rng);
  });

  it('CreateGame absorbs entropy before generating the board', () => {
    const c = cmd('CreateGame', { seed: 7, rulesVersion: 'core-4' }, { rev: 0 });
    const r1 = gameEngine.execute(genesis(), c, ctx(undefined, E1));
    const r2 = gameEngine.execute(genesis(), c, ctx(undefined, E2));
    expect(r1.kind).toBe('accepted');
    expect(r1.state.rng).not.toEqual(r2.state.rng);
    expect(r1.state.board).not.toEqual(r2.state.board);
  });

  it('a handler that draws from the mixed state and rejects returns the input state', () => {
    const s = deepFreeze(lobbyState(REV));
    const r = engine.execute(s, cmd('DRAW_THEN_REJECT', null, { rev: REV }), ctx(undefined, E1));
    expect(r.kind).toBe('rejected');
    expect(r.state).toBe(s);
  });

  it('an envelope rejection returns the input state', () => {
    const s = deepFreeze(lobbyState(REV));
    const r = engine.execute(s, cmd('DRAW', null, { rev: REV - 1 }), ctx(undefined, E1));
    expect(r.kind).toBe('rejected');
    expect(r.state).toBe(s);
  });

  it('same state, command and context twice give deep-equal results', () => {
    const s = deepFreeze(lobbyState(REV));
    const c = cmd('DRAW', null, { rev: REV });
    expect(engine.execute(s, c, ctx(undefined, E1))).toEqual(engine.execute(s, c, ctx(undefined, E1)));
  });

  it('the same drawing command with different entropy draws different values', () => {
    const s = deepFreeze(lobbyState(REV));
    const c = cmd('DRAW', null, { rev: REV });
    const a = engine.execute(s, c, ctx(undefined, E1));
    const b = engine.execute(s, c, ctx(undefined, E2));
    expect(a.events[0]!.payload).not.toEqual(b.events[0]!.payload);
  });
});
