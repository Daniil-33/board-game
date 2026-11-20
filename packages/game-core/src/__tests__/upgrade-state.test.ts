import { describe, expect, it } from 'vitest';
import { CURRENT_RULES_VERSION, SUPPORTED_RULES_VERSIONS, upgradeState, type GameState } from '../index.js';
import { playingGame } from './helpers/game.js';
import { pid } from './helpers/fixtures.js';
import { genesis } from '../state.js';

describe('core-7 state upgrade', () => {
  it('chains core-7 through core-8 to core-9, preserving prisoner and mortgage data', () => {
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
      rulesVersion: 'core-9', charge: null, casino: null, jail: legacy.jail,
      mortgages: { [asset.assetId]: { advance: 500, lapsCompleted: 3, pending: ['a', 'b'], lockedTurnId: null } },
    });
    expect(legacy.rulesVersion).toBe('core-7');
  });

  it('upgrades core-8 prisoners while preserving attempts and adds neutral casino state', () => {
    const current=playingGame(['a','b']).state;
    const legacy:GameState={...current,rulesVersion:'core-8',casino:undefined,jail:{a:{attemptsUsed:2}}};
    expect(upgradeState(legacy)).toMatchObject({rulesVersion:'core-9',casino:null,jail:{a:{attemptsUsed:2}}});
  });

  it('preserves genesis and is the identity on core-9', () => {
    const current = playingGame(['a', 'b']).state;
    expect(upgradeState(current)).toBe(current);
    const empty=genesis();
    expect(upgradeState(empty)).toBe(empty);
    expect(CURRENT_RULES_VERSION).toBe('core-9');
    expect(SUPPORTED_RULES_VERSIONS).toEqual(['core-9']);
  });

  it('rejects unsupported stored versions', () => {
    expect(() => upgradeState({ ...playingGame(['a', 'b']).state, rulesVersion: 'core-6' })).toThrow('Unsupported state rules version');
  });
});
