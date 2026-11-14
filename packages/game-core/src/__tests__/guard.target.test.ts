import { describe, it, expect } from 'vitest';
import { createEngine, ok, revisionGuard, targetGuard, targetsGuard, type CommandRegistry } from '../registry.js';
import type { TargetRef } from '../engine.js';
import type { GameState } from '../state.js';
import type { PlayerId } from '../types.js';
import { cmd, ctx, lobbyState, deepFreeze, player } from './helpers/fixtures.js';

// Fixture target kind "seat": the current seat is the first player's id, or none.
const currentSeat = (s: GameState): string | null => s.players[0]?.id ?? null;

const registry: CommandRegistry = {
  // Revision-guarded "unrelated progress": adds a player at the end, so the seat is unchanged.
  GROW: {
    guard: revisionGuard,
    allowedActors: ['system'],
    allowedPhases: ['lobby'],
    handle: (s, c) => ok({ ...s, players: [...s.players, { id: (c.payload as { id: string }).id as PlayerId }] }, []),
  },
  // Target-guarded: reports what the handler saw.
  ACT_ON_SEAT: {
    guard: targetGuard('seat', currentSeat),
    allowedActors: ['system'],
    allowedPhases: ['lobby'],
    handle: (s) => ok(s, [{ type: 'SAW', payload: { revision: s.revision, players: s.players.length } }]),
  },
  // Target-guarded, players only: for check-order tests.
  PLAYER_ON_SEAT: {
    guard: targetGuard('seat', currentSeat),
    allowedActors: ['player'],
    allowedPhases: ['lobby'],
    handle: (s) => ok(s, []),
  },
};
const engine = createEngine(registry);
const REV = 3;
const SEAT = { kind: 'seat', id: 'a' };

function expectCode(s: GameState, c: ReturnType<typeof cmd>, code: string) {
  const r = engine.execute(s, c, ctx());
  expect(r.kind).toBe('rejected');
  if (r.kind === 'rejected') expect(r.error.code).toBe(code);
  expect(r.state).toBe(s);
}

describe('target guard', () => {
  it('a matching target is accepted after unrelated progress, and the handler sees the current state', () => {
    let s: GameState = lobbyState(REV);
    // The author saw revision REV; three revision-guarded commands land first.
    for (const id of ['c', 'd', 'e']) {
      const r = engine.execute(s, cmd('GROW', { id }, { rev: s.revision }), ctx());
      expect(r.kind).toBe('accepted');
      s = r.state;
    }
    expect(s.revision).toBe(REV + 3);
    const r = engine.execute(deepFreeze(s), cmd('ACT_ON_SEAT', null, { target: SEAT }), ctx());
    expect(r.kind).toBe('accepted');
    expect(r.events[0]!.payload).toEqual({ revision: REV + 3, players: 5 });
    expect(r.revision).toBe(REV + 4);
  });

  it('a different target id is TARGET_MISMATCH', () => {
    expectCode(deepFreeze(lobbyState(REV)), cmd('ACT_ON_SEAT', null, { target: { kind: 'seat', id: 'b' } }), 'TARGET_MISMATCH');
  });

  it('no current target is TARGET_MISMATCH', () => {
    const empty = deepFreeze({ ...lobbyState(REV), players: [] });
    expectCode(empty, cmd('ACT_ON_SEAT', null, { target: SEAT }), 'TARGET_MISMATCH');
  });

  it('a revision expectation equal to the current revision is TARGET_MISMATCH', () => {
    expectCode(deepFreeze(lobbyState(REV)), cmd('ACT_ON_SEAT', null, { rev: REV }), 'TARGET_MISMATCH');
  });

  it('a wrong target kind is TARGET_MISMATCH', () => {
    expectCode(deepFreeze(lobbyState(REV)), cmd('ACT_ON_SEAT', null, { target: { kind: 'turn', id: 'a' } }), 'TARGET_MISMATCH');
  });

  it.each([
    ['null', null],
    ['a target expectation without a target', { kind: 'target' }],
    ['a target that is a string', { kind: 'target', target: 'a' }],
  ])('malformed expected (%s) is TARGET_MISMATCH and does not throw', (_l, expected) => {
    expectCode(deepFreeze(lobbyState(REV)), cmd('ACT_ON_SEAT', null, { expected }), 'TARGET_MISMATCH');
  });

  it('a stale target plus a disallowed actor reports TARGET_MISMATCH, not ACTOR_NOT_ALLOWED', () => {
    expectCode(
      deepFreeze(lobbyState(REV)),
      cmd('ACT_ON_SEAT', null, { target: { kind: 'seat', id: 'b' }, actor: player('a') }),
      'TARGET_MISMATCH',
    );
  });

  it('a current target still goes through the actor check', () => {
    expectCode(deepFreeze(lobbyState(REV)), cmd('PLAYER_ON_SEAT', null, { target: SEAT }), 'ACTOR_NOT_ALLOWED');
  });
});

// spec: engine/command-execution "Target guard" — guard over several target kinds.
describe('multi-kind target guard', () => {
  // Fixture: in the lobby the current targets are a "seat" (first player) and a "door" fixed at "d1",
  // plus an entry of an unguarded kind that must be ignored.
  let current: (s: GameState) => readonly TargetRef[] = (s) =>
    s.players.length === 0
      ? []
      : [
          { kind: 'seat', id: s.players[0]!.id },
          { kind: 'door', id: 'd1' },
          { kind: 'window', id: 'w1' },
        ];
  const multi = createEngine({
    MULTI: {
      guard: targetsGuard(['seat', 'door'], (s) => current(s)),
      allowedActors: ['system'],
      allowedPhases: ['lobby'],
      handle: (s) => ok(s, [{ type: 'SAW', payload: null }]),
    },
  });

  function run(s: GameState, expected: unknown) {
    return multi.execute(s, cmd('MULTI', null, { expected }), ctx());
  }
  function rejectedSame(s: GameState, expected: unknown) {
    const r = run(s, expected);
    expect(r.kind).toBe('rejected');
    if (r.kind === 'rejected') expect(r.error.code).toBe('TARGET_MISMATCH');
    expect(r.state).toBe(s);
  }

  it('accepts a target equal to any one current entry', () => {
    const s = deepFreeze(lobbyState(REV));
    expect(run(s, { kind: 'target', target: { kind: 'seat', id: 'a' } }).kind).toBe('accepted');
    expect(run(s, { kind: 'target', target: { kind: 'door', id: 'd1' } }).kind).toBe('accepted');
  });

  it('rejects a wrong id', () => {
    rejectedSame(deepFreeze(lobbyState(REV)), { kind: 'target', target: { kind: 'door', id: 'd2' } });
  });

  it('rejects a wrong kind, including a current target of an unguarded kind', () => {
    rejectedSame(deepFreeze(lobbyState(REV)), { kind: 'target', target: { kind: 'door', id: 'a' } });
    rejectedSame(deepFreeze(lobbyState(REV)), { kind: 'target', target: { kind: 'window', id: 'w1' } });
  });

  it('rejects when there is no current target', () => {
    rejectedSame(deepFreeze({ ...lobbyState(REV), players: [] }), { kind: 'target', target: { kind: 'seat', id: 'a' } });
  });

  it('rejects a revision expectation equal to the current revision', () => {
    rejectedSame(deepFreeze(lobbyState(REV)), { kind: 'revision', revision: REV });
  });

  it.each([null, { kind: 'target' }, { kind: 'target', target: 'seat' }, 7])('rejects malformed expected %j without throwing', (e) => {
    rejectedSame(deepFreeze(lobbyState(REV)), e);
  });

  it('does not depend on the order of current targets', () => {
    current = (s) => [{ kind: 'door', id: 'd1' }, { kind: 'seat', id: s.players[0]!.id }];
    expect(run(deepFreeze(lobbyState(REV)), { kind: 'target', target: { kind: 'seat', id: 'a' } }).kind).toBe('accepted');
  });
});
