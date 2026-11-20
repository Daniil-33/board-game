import { describe, expect, it } from 'vitest';
import { CURRENT_RULES_VERSION, SUPPORTED_RULES_VERSIONS, upgradeState, type GameState } from '../index.js';
import { playingGame } from './helpers/game.js';
import { pid } from './helpers/fixtures.js';

describe('core-7 state upgrade', () => {
  it('preserves prisoner and mortgage data while adding core-8 fields', () => {
    const current = playingGame(['a', 'b', 'c']).state;
    const asset = current.board!.cells[1]!.asset!;
    const legacy: GameState = {
      ...current,
      rulesVersion: 'core-7',
      jail: { [current.turn!.playerId]: { attemptsUsed: 2 } },
      mortgages: { [asset.assetId]: { advance: 500 as never, lapsCompleted: 3, pending: [pid('a'), pid('b')] } },
      charge: undefined,
    };
    const upgraded = upgradeState(legacy);
    expect(upgraded).toMatchObject({
      rulesVersion: 'core-8', charge: null, jail: legacy.jail,
      mortgages: { [asset.assetId]: { advance: 500, lapsCompleted: 3, pending: ['a', 'b'], lockedTurnId: null } },
    });
    expect(legacy.rulesVersion).toBe('core-7');
  });

  it('is the identity on core-8 and never supports core-7 for new games', () => {
    const current = playingGame(['a', 'b']).state;
    expect(upgradeState(current)).toBe(current);
    expect(CURRENT_RULES_VERSION).toBe('core-8');
    expect(SUPPORTED_RULES_VERSIONS).toEqual(['core-8']);
  });

  it('rejects unsupported stored versions', () => {
    expect(() => upgradeState({ ...playingGame(['a', 'b']).state, rulesVersion: 'core-6' })).toThrow('Unsupported state rules version');
  });
});
