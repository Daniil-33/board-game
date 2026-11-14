import { describe, it, expect } from 'vitest';
import { createEngine, revisionGuard, ok, fail, type CommandRegistry } from '../registry.js';
import { cmd, ctx, lobbyState, player, SYSTEM, deepFreeze } from './helpers/fixtures.js';

const registry: CommandRegistry = {
  SYSTEM_ONLY: { guard: revisionGuard, allowedActors: ['system'], allowedPhases: ['lobby'], handle: (s) => ok(s, []) },
  PLAYER_OK: { guard: revisionGuard, allowedActors: ['player', 'system'], allowedPhases: ['lobby'], handle: (s) => ok(s, []) },
  SETUP_ONLY: { guard: revisionGuard, allowedActors: ['system'], allowedPhases: ['setup'], handle: (s) => ok(s, []) },
  ALWAYS_FAILS: { guard: revisionGuard, allowedActors: ['system'], allowedPhases: ['lobby'], handle: () => fail('INVALID_PAYLOAD', 'nope') },
  TWO_EVENTS: {
    guard: revisionGuard,
    allowedActors: ['system'],
    allowedPhases: ['lobby'],
    handle: (s) => ok(s, [{ type: 'E1', payload: 1 }, { type: 'E2', payload: 2 }]),
  },
  SETS_REVISION: {
    guard: revisionGuard,
    allowedActors: ['system'],
    allowedPhases: ['lobby'],
    // A misbehaving handler that tries to set revision itself; the engine must override it.
    handle: (s) => ok({ ...s, revision: 999 as typeof s.revision }, []),
  },
};

const engine = createEngine(registry);
const REV = 3;

function expectRejected(r: ReturnType<typeof engine.execute>, code: string, input: unknown) {
  expect(r.kind).toBe('rejected');
  if (r.kind !== 'rejected') return;
  expect(r.error.code).toBe(code);
  expect(r.state).toBe(input);
  expect(r.revision).toBe(REV);
  expect(r.events).toEqual([]);
}

describe('engine: envelope checks in isolation', () => {
  it('UNKNOWN_COMMAND', () => {
    const s = deepFreeze(lobbyState(REV));
    expectRejected(engine.execute(s, cmd('NOPE', null, { rev: REV }), ctx()), 'UNKNOWN_COMMAND', s);
  });

  it('UNKNOWN_COMMAND for inherited Object keys', () => {
    const s = lobbyState(REV);
    expectRejected(engine.execute(s, cmd('toString', null, { rev: REV }), ctx()), 'UNKNOWN_COMMAND', s);
  });

  it('REVISION_MISMATCH for stale and future revisions', () => {
    const s = deepFreeze(lobbyState(REV));
    expectRejected(engine.execute(s, cmd('SYSTEM_ONLY', null, { rev: REV - 1 }), ctx()), 'REVISION_MISMATCH', s);
    expectRejected(engine.execute(s, cmd('SYSTEM_ONLY', null, { rev: REV + 1 }), ctx()), 'REVISION_MISMATCH', s);
  });

  it('ACTOR_NOT_ALLOWED', () => {
    const s = deepFreeze(lobbyState(REV));
    const c = cmd('SYSTEM_ONLY', null, { rev: REV, actor: player('a') });
    expectRejected(engine.execute(s, c, ctx()), 'ACTOR_NOT_ALLOWED', s);
  });

  it('UNKNOWN_ACTOR', () => {
    const s = deepFreeze(lobbyState(REV));
    const c = cmd('PLAYER_OK', null, { rev: REV, actor: player('zz') });
    expectRejected(engine.execute(s, c, ctx()), 'UNKNOWN_ACTOR', s);
  });

  it('member player is accepted', () => {
    const r = engine.execute(lobbyState(REV), cmd('PLAYER_OK', null, { rev: REV, actor: player('a') }), ctx());
    expect(r.kind).toBe('accepted');
  });

  it('PHASE_NOT_ALLOWED', () => {
    const s = deepFreeze(lobbyState(REV));
    expectRejected(engine.execute(s, cmd('SETUP_ONLY', null, { rev: REV }), ctx()), 'PHASE_NOT_ALLOWED', s);
  });

  it('handler failure is surfaced with its code', () => {
    const s = deepFreeze(lobbyState(REV));
    expectRejected(engine.execute(s, cmd('ALWAYS_FAILS', null, { rev: REV }), ctx()), 'INVALID_PAYLOAD', s);
  });
});

describe('engine: check order', () => {
  it('stale revision + wrong actor -> REVISION_MISMATCH', () => {
    const s = lobbyState(REV);
    const c = cmd('SYSTEM_ONLY', null, { rev: 0, actor: player('a') });
    expectRejected(engine.execute(s, c, ctx()), 'REVISION_MISMATCH', s);
  });

  it('unknown type beats everything', () => {
    const s = lobbyState(REV);
    const c = cmd('NOPE', null, { rev: 0, actor: player('zz') });
    expectRejected(engine.execute(s, c, ctx()), 'UNKNOWN_COMMAND', s);
  });

  it('wrong actor kind beats non-membership and wrong phase', () => {
    const s = lobbyState(REV);
    const c = cmd('SETUP_ONLY', null, { rev: REV, actor: player('zz') });
    expectRejected(engine.execute(s, c, ctx()), 'ACTOR_NOT_ALLOWED', s);
  });

  it('non-membership beats wrong phase', () => {
    const reg: CommandRegistry = {
      P_SETUP: { guard: revisionGuard, allowedActors: ['player'], allowedPhases: ['setup'], handle: (s) => ok(s, []) },
    };
    const s = lobbyState(REV);
    const c = cmd('P_SETUP', null, { rev: REV, actor: player('zz') });
    expectRejected(createEngine(reg).execute(s, c, ctx()), 'UNKNOWN_ACTOR', s);
  });
});

describe('engine: accepted bookkeeping', () => {
  it('revision N -> N + 1 with previousRevision N, on result and state', () => {
    const r = engine.execute(deepFreeze(lobbyState(REV)), cmd('SYSTEM_ONLY', null, { rev: REV }), ctx());
    expect(r.kind).toBe('accepted');
    if (r.kind !== 'accepted') return;
    expect(r.previousRevision).toBe(REV);
    expect(r.revision).toBe(REV + 1);
    expect(r.state.revision).toBe(REV + 1);
  });

  it('engine overrides a handler-set revision', () => {
    const r = engine.execute(lobbyState(REV), cmd('SETS_REVISION', null, { rev: REV }), ctx());
    expect(r.revision).toBe(REV + 1);
    expect(r.state.revision).toBe(REV + 1);
  });

  it('events keep handler order', () => {
    const r = engine.execute(lobbyState(REV), cmd('TWO_EVENTS', null, { rev: REV }), ctx());
    expect(r.events.map((e) => e.type)).toEqual(['E1', 'E2']);
  });

  it('commandId is echoed', () => {
    const c = cmd('SYSTEM_ONLY', null, { rev: REV, id: 'abc', actor: SYSTEM });
    expect(engine.execute(lobbyState(REV), c, ctx()).commandId).toBe('abc');
  });
});
