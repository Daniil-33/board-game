import { describe, it, expect } from 'vitest';
import { movePlayer } from '../board.js';
import { InvariantViolationError, checkInvariants } from '../invariants.js';
import { genesis, type GameState } from '../state.js';
import { gameEngine } from '../rules.js';
import { projectState, projectEvents } from '../projection.js';
import { replay, restoreSession } from '../session.js';
import { startingCapital, lapReward } from '../money.js';
import { cmd, ctx, pid, player, deepFreeze } from './helpers/fixtures.js';
import { playingGame, setupGame, types, Game } from './helpers/game.js';
import type { Money } from '../types.js';
function violation(state: GameState, name: string) {
  try {
    checkInvariants(state);
  }
  catch (error) {
    expect(error).toBeInstanceOf(InvariantViolationError);
    expect((error as InvariantViolationError).invariant).toBe(name);
    return;
  }
  throw new Error('Expected invariant violation');
}
describe('starting economy', () => {
  it.each([2, 3, 4, 5, 6])('funds %i participants in join order before setup', n => {
    const ids = Array.from({ length: n }, (_, i) => `p${i}`);
    const g = setupGame(ids);
    expect(g.state.economy).toEqual({ startingCapital: startingCapital(n), lapReward: lapReward(startingCapital(n)) });
    expect(Object.keys(g.state.balances)).toEqual(ids);
    expect(Object.values(g.state.balances)).toEqual(ids.map(() => startingCapital(n)));
    expect(types(g.session.log.at(-1)!.events)).toEqual(['GameStarted', ...ids.map(() => 'BalanceChanged'), 'OrderRollStarted']);
  });
  it('uses membership after a lobby departure and leaves rejected starts untouched', () => {
    const g = new Game();
    g.ok(cmd('CreateGame', { seed: 1, rulesVersion: 'core-5' }));
    for (const id of ['a', 'b', 'c'])
      g.ok(cmd('AddPlayer', { playerId: id }, { rev: g.state.revision }));
    g.ok(cmd('LeaveLobby', { playerId: 'c' }, { rev: g.state.revision }));
    g.ok(cmd('StartGame', null, { rev: g.state.revision }));
    expect(g.state.balances).toEqual({ a: 29910, b: 29910 });
    const state = deepFreeze(genesis());
    const rejected = gameEngine.execute(state, cmd('StartGame', null), ctx());
    expect(rejected.state).toBe(state);
    expect(rejected.events).toEqual([]);
  });
  it.each(['setup', 'playing'] as const)('retains eliminated money when resignation finishes during %s', phase => {
    const g = phase === 'setup' ? setupGame(['a', 'b']) : playingGame(['a', 'b']);
    const before = g.state.balances;
    const events = g.ok(cmd('Resign', null, { actor: player('a'), rev: g.state.revision }));
    expect(g.state.phase).toBe('finished');
    expect(g.state.balances).toEqual(before);
    expect(types(events)).not.toContain('BalanceChanged');
    const state = g.state;
    const rejected = g.submit(cmd('Resign', null, { actor: player('b'), rev: state.revision }));
    expect(rejected.kind).toBe('rejected');
    expect(g.state.balances).toEqual(before);
    checkInvariants(g.state);
  });
});
describe('forward crossing and inert landing', () => {
  const base = playingGame(['a', 'b']).state;
  for (const from of [0, 10, 20, 28, 29, 30, 35, 38, 39])
    for (let steps = 2; steps <= 12; steps++)
      it(`from ${from} by ${steps}`, () => {
        const input = deepFreeze({ ...base, positions: { a: from, b: 0 } });
        const result = movePlayer(input, pid('a'), steps);
        const crossed = from + steps >= 40;
        expect(result.state.positions.a).toBe((from + steps) % 40);
        expect(types(result.events)).toEqual(crossed ? ['PlayerMoved', 'BalanceChanged'] : ['PlayerMoved']);
        expect(result.state.balances.a).toBe(base.balances.a! + (crossed ? 3980 : 0));
        if (crossed)
          expect(result.events[1]!.payload).toEqual({ playerId: 'a', delta: 3980, balance: 33890, reason: 'lap-reward' });
        expect(input.balances.a).toBe(29910);
        checkInvariants(result.state);
      });
  it.each([false, true])('orders reward after movement for automatic=%s and replays/restores through crossing', automatic => {
    const g = playingGame(['a', 'b']);
    // Four bonus rolls separated by non-doubles keep the scenario on accepted inputs.
    while (g.state.positions.a! < 30) {
      g.roll(5, 6);
      g.endTurn();
      g.roll(1, 2);
      g.endTurn();
    }
    const snapshot = JSON.parse(JSON.stringify(g.state)) as GameState;
    const rev = g.state.revision;
    const before = g.state.balances.a!;
    const events = automatic ? g.timeout({ dice: [5, 6] }) : g.roll(5, 6);
    const index = types(events).indexOf('PlayerMoved');
    expect(types(events).slice(index, index + 2)).toEqual(['PlayerMoved', 'BalanceChanged']);
    expect(g.state.balances.a).toBe(before + 3980);
    const rebuilt = replay(gameEngine, g.session.log);
    const restored = restoreSession(gameEngine, snapshot, g.session.log.slice(rev));
    for (const s of [rebuilt, restored]) {
      expect(s.state).toEqual(g.state);
      expect(s.state.board).toEqual(g.state.board);
      expect(s.state.balances).toEqual(g.state.balances);
    }
    expect(restored.log.at(-1)!.events).toEqual(events);
  });
  it.each([false, true])('third double pays no reward for automatic=%s', automatic => {
    const g = playingGame(['a', 'b']);
    g.roll(6, 6);
    g.endTurn();
    g.roll(6, 6);
    g.endTurn();
    const before = g.state.balances;
    const events = automatic ? g.timeout({ dice: [6, 6] }) : g.roll(6, 6);
    expect(types(events)).toContain('SentToJail');
    expect(types(events)).not.toContain('PlayerMoved');
    expect(types(events)).not.toContain('BalanceChanged');
    expect(g.state.balances).toEqual(before);
  });
  it('interim releases from 10 never cross start', () => {
    const g = playingGame(['a', 'b']);
    for (let i = 0; i < 3; i++) {
      g.roll(6, 6);
      if (i < 2)
        g.endTurn();
    }
    g.roll(1, 2);
    g.endTurn();
    const before = g.state.balances;
    const events = g.roll(6, 6);
    expect(types(events)).toContain('InterimJailReleased');
    expect(g.state.positions.a).toBe(22);
    expect(types(events)).not.toContain('BalanceChanged');
    expect(g.state.balances).toEqual(before);
  });
});
describe('money and board invariants', () => {
  const base = playingGame(['a', 'b']).state;
  it.each([-10, 1.5, 1, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity])('rejects invalid balance %s', v => violation({ ...base, balances: { ...base.balances, a: v as Money } }, 'balances'));
  it('rejects missing/extra keys and wrong economy presence', () => {
    violation({ ...base, balances: { a: base.balances.a! } }, 'balances');
    violation({ ...base, balances: { ...base.balances, z: 0 as Money } }, 'balances');
    violation({ ...base, economy: null }, 'balances');
    violation({ ...genesis(), balances: { a: 0 as Money } }, 'balances');
    violation({ ...genesis(), economy: base.economy }, 'balances');
  });
  it.each(['index', 'kind', 'null', 'price', 'rank', 'group', 'category', 'duplicate', 'mixed', 'repeat'] as const)('rejects malformed board %s', mutation => {
    const board = JSON.parse(JSON.stringify(base.board)) as NonNullable<GameState['board']>;
    const cells = board.cells as {
      index: number;
      kind: string;
      asset: Record<string, unknown> | null;
    }[];
    const a = cells[1]!.asset!;
    if (mutation === 'index')
      cells[0]!.index = 2;
    if (mutation === 'kind')
      cells[0]!.kind = 'jail';
    if (mutation === 'null')
      cells[1]!.asset = null;
    if (mutation === 'price')
      a.price = 730;
    if (mutation === 'rank')
      a.rank = 2;
    if (mutation === 'group')
      a.groupId = 'M2';
    if (mutation === 'category')
      a.categoryId = 'unknown';
    if (mutation === 'duplicate')
      cells[3]!.asset = { ...a, price: 800 };
    if (mutation === 'mixed')
      cells[3]!.asset = { ...cells[6]!.asset!, rank: 1, groupId: 'M1', price: 800 };
    if (mutation === 'repeat')
      for (const index of [6, 8, 9])
        cells[index]!.asset = { ...a, assetId: `fake-${index}`, rank: 2, groupId: 'M2', price: index === 9 ? 1030 : 930 };
    violation({ ...base, board }, 'board-shape');
  });
  it('projects detached data and public events for all viewers', () => {
    const g = playingGame(['a', 'b']);
    const source = deepFreeze(g.state);
    for (const viewer of [{ kind: 'spectator' } as const, { kind: 'player', id: pid('a') } as const, { kind: 'player', id: pid('stranger') } as const]) {
      const view = projectState(source, viewer);
      expect(view.board).toEqual(source.board);
      expect(view.board).not.toBe(source.board);
      expect(view.economy).toEqual(source.economy);
      expect(view.economy).not.toBe(source.economy);
      expect(view.balances).toEqual(source.balances);
      expect(view.balances).not.toBe(source.balances);
      expect(view).not.toHaveProperty('rng');
      const events = g.session.log.flatMap(e => e.events);
      expect(projectEvents(events, viewer)).toEqual(events);
    }
  });
});
