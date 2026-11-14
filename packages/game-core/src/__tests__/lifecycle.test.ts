import { describe, it, expect } from 'vitest';
import { gameEngine } from '../lifecycle.js';
import { genesis, type GameState } from '../state.js';
import type { GameCommand, TransitionResult, GameEvent } from '../engine.js';
import { cmd, ctx, player, deepFreeze } from './helpers/fixtures.js';

const NOW = 1_767_225_600_000;

function run(state: GameState, c: GameCommand): TransitionResult<GameState, GameEvent> {
  return gameEngine.execute(deepFreeze(state), c, ctx(NOW));
}

function accepted(state: GameState, c: GameCommand): GameState {
  const r = run(state, c);
  if (r.kind !== 'accepted') throw new Error(`expected accept, got ${r.error.code}`);
  return r.state;
}

function expectCode(state: GameState, c: GameCommand, code: string) {
  const r = run(state, c);
  expect(r.kind).toBe('rejected');
  if (r.kind === 'rejected') {
    expect(r.error.code).toBe(code);
    expect(r.state).toBe(state);
  }
}

const create = (seed: unknown = 42, rulesVersion: unknown = 'core-0', rev = 0) =>
  cmd('CreateGame', { seed, rulesVersion }, { rev });
const add = (id: string, rev: number) => cmd('AddPlayer', { playerId: id }, { rev });
const start = (rev: number) => cmd('StartGame', null, { rev });

function lobbyWith(n: number): GameState {
  let s = accepted(genesis(), create());
  for (let i = 0; i < n; i++) s = accepted(s, add(`p${i}`, s.revision));
  return s;
}

describe('CreateGame', () => {
  it('moves genesis to lobby at revision 1 with one GameCreated', () => {
    const r = run(genesis(), create());
    expect(r.kind).toBe('accepted');
    expect(r.revision).toBe(1);
    expect(r.state.phase).toBe('lobby');
    expect(r.state.rulesVersion).toBe('core-0');
    expect(r.events).toEqual([{ type: 'GameCreated', payload: { rulesVersion: 'core-0', createdAt: NOW } }]);
  });

  it('same seed gives deep-equal rng; different seed differs', () => {
    expect(accepted(genesis(), create(7)).rng).toEqual(accepted(genesis(), create(7)).rng);
    expect(accepted(genesis(), create(7)).rng).not.toEqual(accepted(genesis(), create(8)).rng);
  });

  it('seed bounds', () => {
    expect(run(genesis(), create(0)).kind).toBe('accepted');
    expect(run(genesis(), create(2 ** 32 - 1)).kind).toBe('accepted');
    expectCode(genesis(), create(2 ** 32), 'INVALID_SEED');
    expectCode(genesis(), create(1.5), 'INVALID_SEED');
    expectCode(genesis(), create(-1), 'INVALID_SEED');
    expectCode(genesis(), create('42'), 'INVALID_SEED');
  });

  it('unsupported rules version', () => {
    expectCode(genesis(), create(42, 'core-999'), 'UNSUPPORTED_RULES_VERSION');
  });

  it('malformed payload', () => {
    expectCode(genesis(), cmd('CreateGame', null), 'INVALID_PAYLOAD');
    expectCode(genesis(), cmd('CreateGame', { rulesVersion: 'core-0' }), 'INVALID_PAYLOAD');
    expectCode(genesis(), cmd('CreateGame', { seed: 1 }), 'INVALID_PAYLOAD');
  });

  it('second CreateGame in lobby -> PHASE_NOT_ALLOWED', () => {
    const s = lobbyWith(0);
    expectCode(s, create(42, 'core-0', s.revision), 'PHASE_NOT_ALLOWED');
  });

  it('player actor cannot create', () => {
    expectCode(genesis(), cmd('CreateGame', { seed: 1, rulesVersion: 'core-0' }, { actor: player('a') }), 'ACTOR_NOT_ALLOWED');
  });
});

describe('AddPlayer', () => {
  it('appends in join order with one PlayerAdded', () => {
    const s1 = lobbyWith(1);
    const r = run(s1, add('zed', s1.revision));
    expect(r.state.players.map((p) => p.id)).toEqual(['p0', 'zed']);
    expect(r.events).toEqual([{ type: 'PlayerAdded', payload: { playerId: 'zed' } }]);
  });

  it('player actor cannot add themselves', () => {
    const s = lobbyWith(1);
    expectCode(s, cmd('AddPlayer', { playerId: 'x' }, { rev: s.revision, actor: player('p0') }), 'ACTOR_NOT_ALLOWED');
  });

  it('duplicate id', () => {
    const s = lobbyWith(2);
    expectCode(s, add('p1', s.revision), 'DUPLICATE_PLAYER');
  });

  it('seventh player', () => {
    const s = lobbyWith(6);
    expectCode(s, add('p6', s.revision), 'PLAYER_LIMIT_REACHED');
  });

  it('malformed payload', () => {
    const s = lobbyWith(0);
    expectCode(s, cmd('AddPlayer', { playerId: '' }, { rev: s.revision }), 'INVALID_PAYLOAD');
    expectCode(s, cmd('AddPlayer', { playerId: 5 }, { rev: s.revision }), 'INVALID_PAYLOAD');
    expectCode(s, cmd('AddPlayer', null, { rev: s.revision }), 'INVALID_PAYLOAD');
  });

  it('not before CreateGame', () => {
    expectCode(genesis(), add('a', 0), 'PHASE_NOT_ALLOWED');
  });
});

describe('StartGame', () => {
  it('moves to setup with GameStarted listing players in join order', () => {
    const s = lobbyWith(2);
    const r = run(s, start(s.revision));
    expect(r.kind).toBe('accepted');
    expect(r.state.phase).toBe('setup');
    expect(r.events).toEqual([{ type: 'GameStarted', payload: { playerIds: ['p0', 'p1'] } }]);
  });

  it('too few players', () => {
    const s = lobbyWith(1);
    expectCode(s, start(s.revision), 'NOT_ENOUGH_PLAYERS');
  });
});

describe('setup phase accepts no lifecycle command', () => {
  const s = (() => {
    const l = lobbyWith(2);
    return accepted(l, start(l.revision));
  })();

  it.each([
    ['CreateGame', () => create(1, 'core-0', s.revision)],
    ['AddPlayer', () => add('late', s.revision)],
    ['StartGame', () => start(s.revision)],
  ])('%s -> PHASE_NOT_ALLOWED', (_name, make) => {
    expectCode(s, make(), 'PHASE_NOT_ALLOWED');
  });
});
