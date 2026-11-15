import { describe, it, expect } from 'vitest';
import { projectState, type Viewer } from '../projection.js';
import type { GameState } from '../state.js';
import { lobbyState, deepFreeze, pid } from './helpers/fixtures.js';
import { setupGame, playingGame } from './helpers/game.js';

const PLAYER: Viewer = { kind: 'player', id: pid('a') };
const SPECTATOR: Viewer = { kind: 'spectator' };
const setupState = (): GameState => setupGame(['a', 'b']).state;
const playingState = (): GameState => {
  const g = playingGame(['a', 'b']);
  g.roll(3, 4);
  return g.state;
};

describe('projectState', () => {
  it.each([
    ['lobby', lobbyState],
    ['setup', setupState],
    ['playing', playingState],
  ])('never exposes the rng in %s, for players or spectators', (_phase, make) => {
    const s = deepFreeze(make());
    for (const viewer of [PLAYER, SPECTATOR]) {
      const view = projectState(s, viewer);
      expect(view).not.toHaveProperty('rng');
      const json = JSON.stringify(view);
      for (const word of s.rng!.s) expect(json).not.toContain(String(word));
    }
  });

  it('carries every public field unchanged', () => {
    const s = deepFreeze(lobbyState(7));
    expect(projectState(s, PLAYER)).toEqual({
      revision: s.revision,
      rulesVersion: s.rulesVersion,
      phase: s.phase,
      players: s.players,
      setup: s.setup,
      order: s.order,
      turn: s.turn,
      positions: s.positions,
      jail: s.jail,
      eliminated: s.eliminated,
      winner: s.winner,
    });
  });

  it.each([
    ['setup', setupState],
    ['playing', playingState],
  ])('carries the order-roll, order, turn, positions and jail fields unchanged in %s', (_phase, make) => {
    const s = deepFreeze(make());
    const view = projectState(s, SPECTATOR);
    expect(view).toEqual({
      revision: s.revision,
      rulesVersion: s.rulesVersion,
      phase: s.phase,
      players: s.players,
      setup: s.setup,
      order: s.order,
      turn: s.turn,
      positions: s.positions,
      jail: s.jail,
      eliminated: s.eliminated,
      winner: s.winner,
    });
    expect(view).not.toHaveProperty('rng');
  });

  it('treats a non-member player as a spectator', () => {
    const s = deepFreeze(lobbyState());
    expect(projectState(s, { kind: 'player', id: pid('zz') })).toEqual(projectState(s, SPECTATOR));
  });

  it('is plain data: a JSON round-trip is deep-equal', () => {
    const view = projectState(lobbyState(), PLAYER);
    expect(JSON.parse(JSON.stringify(view))).toEqual(view);
  });

  it('is pure: same view twice, state untouched, no shared references', () => {
    const s = deepFreeze(lobbyState());
    const before = JSON.stringify(s);
    const a = projectState(s, PLAYER);
    const b = projectState(s, PLAYER);
    expect(a).toEqual(b);
    expect(JSON.stringify(s)).toBe(before);
    expect(a.players).not.toBe(s.players);
  });
});
