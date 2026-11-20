import { describe, it, expect } from 'vitest';
import { gameEngine } from '../rules.js';
import { CURRENT_RULES_VERSION, SUPPORTED_RULES_VERSIONS } from '../lifecycle.js';
import { genesis, type GameState } from '../state.js';
import { checkInvariants, InvariantViolationError } from '../invariants.js';
import { pendingDeadlines } from '../deadlines.js';
import { projectState, projectEvents, type Viewer } from '../projection.js';
import { absorbEntropy } from '../rng.js';
import { replay, restoreSession } from '../session.js';
import { cmd, ctx, deepFreeze, pid, player, DEFAULT_ENTROPY } from './helpers/fixtures.js';
import { Game, setupGame, playingGame, types, T0 } from './helpers/game.js';
import type { GameCommand } from '../engine.js';

const resign = (g: Game, id: string) => cmd('Resign', null, { actor: player(id), rev: g.state.revision });
function reject(g: Game, c: GameCommand, code: string) {
  const before = deepFreeze(g.state);
  const r = g.submit(c);
  expect(r.kind === 'rejected' && r.error.code).toBe(code);
  expect(g.state).toBe(before);
  expect(r.state.rng).toEqual(before.rng);
  expect(r.events).toEqual([]);
}

// specs: engine/game-lifecycle "Leave a lobby", "Rules version gate"
describe('LeaveLobby', () => {
  function lobby(ids = ['a', 'b', 'c']) {
    const g = new Game();
    g.ok(cmd('CreateGame', { seed: 1, rulesVersion: CURRENT_RULES_VERSION }));
    for (const playerId of ids) g.ok(cmd('AddPlayer', { playerId }, { rev: g.state.revision }));
    return g;
  }
  const leave = (g: Game, playerId: unknown) => cmd('LeaveLobby', { playerId }, { rev: g.state.revision });
  it('preserves join order and can remove every participant without ending the lobby', () => {
    const g = lobby();
    expect(g.ok(leave(g, 'b'))).toEqual([{ type: 'PlayerLeftLobby', payload: { playerId: 'b' } }]);
    expect(g.state.players.map((p) => p.id)).toEqual(['a', 'c']);
    g.ok(leave(g, 'a'));
    reject(g, cmd('StartGame', null, { rev: g.state.revision }), 'NOT_ENOUGH_PLAYERS');
    g.ok(leave(g, 'c'));
    expect(g.state).toMatchObject({ phase: 'lobby', players: [], eliminated: [], winner: null });
    g.ok(cmd('AddPlayer', { playerId: 'b' }, { rev: g.state.revision }));
    expect(g.state.players.map((p) => p.id)).toEqual(['b']);
  });
  it.each([null, {}, { playerId: '' }, { playerId: 42 }, []])('rejects malformed payload %j', (payload) => {
    const g = lobby();
    reject(g, cmd('LeaveLobby', payload, { rev: g.state.revision }), 'INVALID_PAYLOAD');
  });
  it('checks revision, actor, membership and phase without changing state or RNG', () => {
    const g = lobby();
    reject(g, leave(g, 'absent'), 'PLAYER_NOT_FOUND');
    reject(g, cmd('LeaveLobby', { playerId: 'a' }, { rev: 0, actor: player('a') }), 'REVISION_MISMATCH');
    reject(g, cmd('LeaveLobby', { playerId: 'a' }, { rev: g.state.revision, actor: player('a') }), 'ACTOR_NOT_ALLOWED');
    for (const started of [setupGame(['a', 'b']), playingGame(['a', 'b'])]) reject(started, leave(started, 'a'), 'PHASE_NOT_ALLOWED');
  });
  it('handles prototype-like ids as ordinary participants', () => {
    const g = lobby(['__proto__', 'constructor', 'toString']);
    g.ok(leave(g, 'constructor'));
    expect(g.state.players.map((p) => p.id)).toEqual(['__proto__', 'toString']);
    g.ok(cmd('StartGame', null, { rev: g.state.revision }));
    expect(g.state.phase).toBe('setup');
  });
  it('supports the current rules version only', () => {
    expect(SUPPORTED_RULES_VERSIONS).toEqual([CURRENT_RULES_VERSION]);
    for (const rulesVersion of ['core-1', 'core-2', 'unknown']) {
      const r = gameEngine.execute(genesis(), cmd('CreateGame', { seed: 1, rulesVersion }), ctx());
      expect(r.kind === 'rejected' && r.error.code).toBe('UNSUPPORTED_RULES_VERSION');
    }
    expect(genesis()).toMatchObject({ eliminated: [], winner: null });
  });
});

// specs: engine/resignation "Voluntary resignation", "Permanent elimination"
describe('Resign validation', () => {
  it('checks envelope in existing order and rejects malformed/repeated resignations', () => {
    const g = setupGame(['a', 'b', 'c', 'd']);
    reject(g, cmd('Resign', {}, { rev: 0 }), 'REVISION_MISMATCH');
    reject(g, cmd('Resign', null, { rev: g.state.revision }), 'ACTOR_NOT_ALLOWED');
    reject(g, resign(g, 'stranger'), 'UNKNOWN_ACTOR');
    reject(g, { ...resign(g, 'a'), payload: {} }, 'INVALID_PAYLOAD');
    const stale = resign(g, 'b');
    g.ok(resign(g, 'c'));
    reject(g, stale, 'REVISION_MISMATCH');
    reject(g, resign(g, 'c'), 'PLAYER_ELIMINATED');
    const lobby = new Game();
    lobby.ok(cmd('CreateGame', { seed: 1, rulesVersion: CURRENT_RULES_VERSION }));
    lobby.ok(cmd('AddPlayer', { playerId: 'a' }, { rev: lobby.state.revision }));
    reject(lobby, resign(lobby, 'a'), 'PHASE_NOT_ALLOWED');
  });
  it.each([-1, 0, 1, 60_000])('accepts %d ms relative to deadline in setup and playing', (offset) => {
    for (const g of [setupGame(['a', 'b', 'c']), playingGame(['a', 'b', 'c'])]) {
      const before = g.state;
      const events = g.ok(resign(g, 'a'), { at: g.deadline + offset });
      expect(types(events)).not.toContain('DiceRolled');
      expect(types(events)).not.toContain('OrderDieRolled');
      expect(g.state.rng).toEqual(absorbEntropy(before.rng!, DEFAULT_ENTROPY));
      expect(g.state.revision).toBe(before.revision + 1);
    }
  });
});

// specs: engine/resignation "Setup resignation preserves surviving progress", "Setup roller replacement"
describe('resignation during setup', () => {
  it('replaces the current roller with a fresh full deadline and invalidates its old target', () => {
    const g = setupGame(['a', 'b', 'c']);
    const old = g.state.setup!;
    const stale = g.timeoutCmd();
    const events = g.ok(resign(g, 'a'), { at: T0 + 1_000 });
    expect(types(events)).toEqual(['PlayerResigned', 'OrderRollStarted']);
    expect(g.state.setup).toMatchObject({ playerId: 'b', deadline: T0 + 46_000, round: { pending: ['b', 'c'], rolls: {} } });
    expect(g.state.setup!.setupRollId).not.toBe(old.setupRollId);
    reject(g, stale, 'TARGET_MISMATCH');
    g.rollForOrder(2);
    g.rollForOrder(5);
    expect(g.state.order).toEqual(['c', 'b']);
  });
  it('removes already recorded results and keeps the surviving roller target valid', () => {
    const g = setupGame(['a', 'b', 'c', 'd']);
    g.rollForOrder(6);
    g.rollForOrder(2);
    const old = g.state.setup!;
    const timeout = g.timeoutCmd();
    expect(types(g.ok(resign(g, 'a')))).toEqual(['PlayerResigned']);
    expect(g.state.setup).toMatchObject({ setupRollId: old.setupRollId, deadline: old.deadline, playerId: 'c', round: { rolls: { b: 2 }, pending: ['c', 'd'] } });
    g.ok(timeout, { at: old.deadline, dice: [4] });
    g.rollForOrder(1);
    expect(g.state.order).toEqual(['c', 'b', 'd']);
  });
  it('ranks completed surviving rolls when the last pending participant resigns', () => {
    const g = setupGame(['a', 'b', 'c']);
    g.rollForOrder(2);
    g.rollForOrder(6);
    const events = g.ok(resign(g, 'c'));
    expect(types(events)).toEqual(['PlayerResigned', 'TurnOrderDetermined', 'TurnStarted']);
    expect(g.state.order).toEqual(['b', 'a']);
  });
  it('preserves tied surviving results then rerolls only the tied group', () => {
    const g = setupGame(['a', 'b', 'c', 'd']);
    for (const value of [4, 4, 1]) g.rollForOrder(value);
    const events = g.ok(resign(g, 'd'));
    expect(types(events)).toEqual(['PlayerResigned', 'OrderTied', 'OrderRollStarted']);
    expect(g.state.setup!.groups).toEqual([['a', 'b'], ['c']]);
    g.rollForOrder(2);
    g.rollForOrder(5);
    expect(g.state.order).toEqual(['b', 'a', 'c']);
  });
  it.each(['a', 'b'])('collapses the current tie group when %s resigns, skipping an unnecessary pending roll', (id) => {
    const g = setupGame(['a', 'b', 'c', 'd']);
    for (const value of [6, 6, 2, 2]) g.rollForOrder(value);
    g.rollForOrder(3);
    g.ok(resign(g, id));
    expect(g.state.setup!.playerId).toBe('c');
    expect(g.state.setup!.groups).toEqual([[id === 'a' ? 'b' : 'a'], ['c', 'd']]);
    g.rollForOrder(1);
    g.rollForOrder(5);
    expect(g.state.order).toEqual([id === 'a' ? 'b' : 'a', 'd', 'c']);
  });
  it('removes an earlier singleton group and remaps the index without replacing the target', () => {
    const g = setupGame(['a', 'b', 'c', 'd']);
    for (const value of [6, 4, 4, 1]) g.rollForOrder(value);
    const old = g.state.setup!;
    const roll = g.rollForOrderCmd('b');
    g.ok(resign(g, 'a'));
    expect(g.state.setup).toMatchObject({ setupRollId: old.setupRollId, deadline: old.deadline, round: { groupIndex: 0 } });
    g.ok(roll, { dice: [2] });
    g.rollForOrder(5);
    expect(g.state.order).toEqual(['c', 'b', 'd']);
  });
  it('resolves a later tie singleton while preserving the current partial round', () => {
    const g = setupGame(['a', 'b', 'c', 'd', 'e', 'f']);
    for (const value of [6, 6, 4, 4, 2, 2]) g.rollForOrder(value);
    g.rollForOrder(1);
    const old = g.state.setup!;
    g.ok(resign(g, 'd'));
    expect(g.state.setup!.setupRollId).toBe(old.setupRollId);
    expect(g.state.setup!.round).toEqual(old.round);
    for (const value of [5, 1, 3]) g.rollForOrder(value);
    expect(g.state.order).toEqual(['b', 'a', 'c', 'f', 'e']);
  });
  it('collapsing the final tie starts play with no additional dice', () => {
    const g = setupGame(['a', 'b', 'c']);
    for (const value of [6, 3, 3]) g.rollForOrder(value);
    g.ok(resign(g, 'b'));
    expect(g.state.order).toEqual(['a', 'c']);
    expect(g.state.turn!.playerId).toBe('a');
  });
});

// specs: engine/resignation "Resignation closes an owned turn", "Other player's turn survives"
describe('resignation during play', () => {
  it.each(['unrolled', 'double', 'bonus', 'continuation', 'jail'])('closes an owned %s turn without a bonus', (mode) => {
    const g = playingGame(['a', 'b', 'c']);
    if (mode === 'double' || mode === 'bonus') g.roll(2, 2);
    if (mode === 'bonus') g.endTurn();
    if (mode === 'continuation') g.timeout({ dice: [1, 2] });
    if (mode === 'jail') {
      for (let i = 0; i < 3; i++) { g.roll(3, 3); if (i < 2) g.endTurn(); }
      g.roll(1, 2); g.endTurn(); g.roll(1, 2); g.endTurn();
      expect(g.state.jail).toHaveProperty('a');
    }
    const hadAssets = Object.values(g.state.owners).includes(pid('a'));
    const old = g.state.turn!;
    const stale = g.timeoutCmd();
    const events = g.ok(resign(g, 'a'));
    expect(types(events)).toEqual(['PlayerResigned', ...(hadAssets ? ['AssetsReleased'] : []), 'TurnEnded', 'TurnStarted']);
    expect(events.find(e => e.type === 'TurnEnded')).toEqual({ type: 'TurnEnded', payload: { turnId: old.turnId, playerId: 'a', reason: 'resigned' } });
    expect(g.state.turn).toMatchObject({ playerId: 'b', bonus: false, rolled: false, continuation: false, doublesStreak: 0, pendingBonus: false, deadline: g.now + 45_000, quotas: { builds: 1, offers: 2 } });
    expect(g.state.turn!.turnId).not.toBe(old.turnId);
    expect(Object.hasOwn(g.state.positions, 'a')).toBe(false);
    expect(Object.hasOwn(g.state.jail, 'a')).toBe(false);
    expect(g.state.players.map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(g.state.eliminated).toEqual(['a']);
    reject(g, stale, 'TARGET_MISMATCH');
    reject(g, g.rollDiceCmd('a'), 'NOT_ACTIVE_PLAYER');
    reject(g, g.endTurnCmd('a'), 'NOT_ACTIVE_PLAYER');
  });
  it('wraps to the first survivor when the last turn owner resigns', () => {
    const g = playingGame(['a', 'b', 'c']);
    for (let i = 0; i < 2; i++) { g.roll(1, 2); g.endTurn(); }
    g.ok(resign(g, 'c'));
    expect(g.state.turn!.playerId).toBe('a');
  });
  it.each(['unrolled', 'double', 'continuation'])('preserves another player’s entire %s turn and target', (mode) => {
    const g = playingGame(['a', 'b', 'c']);
    if (mode === 'double') g.roll(2, 2);
    if (mode === 'continuation') g.timeout({ dice: [1, 2] });
    const turn = g.state.turn!;
    const timeout = g.timeoutCmd();
    expect(types(g.ok(resign(g, 'b')))).toEqual(['PlayerResigned']);
    expect(g.state.turn).toBe(turn);
    expect(g.state.order).toEqual(['a', 'c']);
    g.ok(timeout, { at: turn.deadline, dice: [1, 2] });
    if (mode === 'double') { g.roll(1, 2); g.endTurn(); }
    else if (g.state.turn!.playerId !== 'c') g.timeout();
    while (g.state.auction !== null) g.timeout();
    expect(g.state.turn!.playerId).toBe('c');
  });
});

// specs: engine/resignation "Last active player wins", "Finished games reject further actions"
describe('victory and public projection', () => {
  it.each(['setup', 'owner', 'other'])('finishes from %s with the specified event sequence and no deadline', (mode) => {
    const g = mode === 'setup' ? setupGame(['a', 'b']) : playingGame(['a', 'b']);
    const stale = g.timeoutCmd();
    const id = mode === 'other' ? 'b' : 'a';
    const winner = mode === 'other' ? 'a' : 'b';
    const c = resign(g, id);
    const events = g.ok(c);
    expect(types(events)).toEqual(mode === 'owner' ? ['PlayerResigned', 'TurnEnded', 'GameEnded'] : ['PlayerResigned', 'GameEnded']);
    expect(events.at(-1)).toEqual({ type: 'GameEnded', payload: { winner, at: g.now, eliminations: g.state.eliminations, finalBalances: g.state.balances } });
    expect(g.state).toMatchObject({ phase: 'finished', winner, eliminated: [id], setup: null, order: null, turn: null });
    expect(g.state.positions).toEqual(mode === 'setup' ? {} : { [winner]: 0 });
    expect(pendingDeadlines(g.state)).toEqual([]);
    reject(g, stale, 'TARGET_MISMATCH');
    reject(g, resign(g, winner), 'PHASE_NOT_ALLOWED');
    for (const type of ['RollForOrder', 'RollDice', 'EndTurn']) reject(g, cmd(type, null, { actor: player(winner), target: { kind: type === 'RollForOrder' ? 'setupRoll' : 'turn', id: 'old' } }), 'TARGET_MISMATCH');
    const before = g.state;
    expect(g.submit(c).kind).toBe('accepted');
    expect(g.state).toBe(before);
    for (const viewer of [{ kind: 'player', id: pid(id) }, { kind: 'player', id: pid(winner) }, { kind: 'player', id: pid('stranger') }, { kind: 'spectator' }] satisfies Viewer[]) {
      const view = projectState(g.state, viewer);
      expect(view).toMatchObject({ eliminated: [id], winner });
      expect(view).not.toHaveProperty('rng');
      expect(view.eliminated).not.toBe(g.state.eliminated);
      const projected = projectEvents(events, viewer);
      expect(projected).toEqual(events);
      expect(projected[0]!.payload).not.toBe(events[0]!.payload);
    }
  });
  it('retains only the winner’s own jail/position in finished', () => {
    const g = playingGame(['a', 'b']);
    for (let i = 0; i < 3; i++) { g.roll(3, 3); if (i < 2) g.endTurn(); }
    g.ok(resign(g, 'b'));
    expect(g.state).toMatchObject({ winner: 'a', jail: { a: { attemptsUsed: 0 } }, positions: { a: 10 } });
    checkInvariants(g.state);
  });
});

// specs: engine/command-execution "Active membership invariants", "Winner invariants"
describe('elimination invariants', () => {
  it('rejects resurrected membership, records and invalid winners', () => {
    const g = playingGame(['a', 'b', 'c']);
    g.ok(resign(g, 'b'));
    const s = g.state;
    const broken: GameState[] = [
      { ...s, positions: { ...s.positions, b: 0 } },
      { ...s, jail: { b: { attemptsUsed: 0 } } },
      { ...s, order: [pid('a'), pid('b')] },
      { ...s, turn: { ...s.turn!, playerId: pid('b') } },
      { ...s, eliminated: [pid('b'), pid('b')] },
      { ...s, eliminated: [pid('absent')] },
      { ...s, winner: pid('a') },
      { ...s, eliminated: [pid('a'), pid('b')] },
      { ...s, phase: 'finished', setup: null, order: null, turn: null, winner: pid('a') },
    ];
    for (const state of broken) expect(() => checkInvariants(state)).toThrow(InvariantViolationError);
    g.ok(resign(g, 'c'));
    for (const state of [{ ...g.state, winner: pid('b') }, { ...g.state, turn: s.turn }, { ...g.state, order: s.order }, { ...g.state, positions: { b: 0 } }, { ...g.state, jail: { b: { attemptsUsed: 0 } } }]) expect(() => checkInvariants(state)).toThrow(InvariantViolationError);
  });
  it('rejects eliminated setup members and malformed round partitions', () => {
    const g = setupGame(['a', 'b', 'c']);
    const original = g.state.setup!;
    g.ok(resign(g, 'c'));
    const s = g.state;
    for (const setup of [original, { ...s.setup!, round: { ...s.setup!.round, pending: [pid('a'), pid('c')] } }, { ...s.setup!, round: { ...s.setup!.round, rolls: { c: 5 } } }, { ...s.setup!, groups: [[], [pid('a'), pid('b')]] }]) expect(() => checkInvariants({ ...s, setup })).toThrow(InvariantViolationError);
  });
});

// specs: engine/resignation "Resignation replay and restoration"
describe('prototype-like ids and snapshot recovery', () => {
  it.each(['__proto__', 'constructor', 'toString'])('removes %s safely from rolls, positions and jail', (id) => {
    const ids = [id, 'survivor', 'third'];
    const setup = setupGame(ids);
    setup.rollForOrder(6);
    setup.ok(resign(setup, id));
    expect(Object.hasOwn(setup.state.setup!.round.rolls, id)).toBe(false);
    const g = playingGame(ids);
    for (let i = 0; i < 3; i++) { g.roll(3, 3); if (i < 2) g.endTurn(); }
    expect(Object.hasOwn(g.state.jail, id)).toBe(true);
    g.ok(resign(g, id));
    expect(Object.hasOwn(g.state.jail, id)).toBe(false);
    expect(Object.hasOwn(g.state.positions, id)).toBe(false);
    expect(projectState(g.state, { kind: 'player', id: pid(id) }).eliminated).toEqual([id]);
    expect(replay(gameEngine, g.session.log).state).toEqual(g.state);
  });
  it.each(['setup', 'playing'])('restores every cut across %s resignations and victory', (phase) => {
    const g = phase === 'setup' ? setupGame(['a', 'b', 'c', 'd']) : playingGame(['a', 'b', 'c', 'd']);
    const snapshots: GameState[] = [g.state];
    if (phase === 'setup') g.rollForOrder(5); else g.roll(2, 2);
    snapshots.push(g.state);
    for (const id of ['b', 'a', 'c']) {
      g.ok(resign(g, id));
      snapshots.push(g.state);
    }
    const replayed = replay(gameEngine, g.session.log);
    expect(replayed.state).toEqual(g.state);
    expect(replayed.log.map((e) => e.events)).toEqual(g.session.log.map((e) => e.events));
    for (const snapshot of snapshots) {
      const tail = g.session.log.slice(snapshot.revision);
      const restored = restoreSession(gameEngine, snapshot, tail);
      expect(restored.state).toEqual(g.state);
      expect(restored.state.rng).toEqual(g.state.rng);
      expect(restored.log.map((e) => e.events)).toEqual(tail.map((e) => e.events));
      expect(pendingDeadlines(restored.state)).toEqual([]);
      const later = resign(g, 'd');
      expect(restored.submit(later, ctx(g.now))).toEqual(g.submit(later));
      if (tail.length) {
        const before = restored.state;
        expect(restored.submit(tail[0]!.command, ctx(g.now)).kind).toBe('accepted');
        expect(restored.state).toBe(before);
      }
    }
  });
});
