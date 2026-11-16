import {
  checkInvariants, createSession, CURRENT_RULES_VERSION, entropy, gameEngine,
  rentFor, timestamp, type GameState, type PlayerId, type Money,
} from '@game/game-core';

export const FIXTURE_NAMES = ['regular-rent', 'full-group-rent', 'logistics-rent', 'energy-rent',
  'own-asset', 'shortfall', 'building', 'open-rent'] as const;
export type FixtureName = typeof FIXTURE_NAMES[number];

/** Deterministic scenario genesis; seats are existing guest ids, deadlines use the host clock. */
export function buildFixture(name: FixtureName, ids: readonly string[], now: number): GameState {
  if (!FIXTURE_NAMES.includes(name) || ids.length < 2 || ids.length > 6 || new Set(ids).size !== ids.length) {
    throw new Error('Invalid fixture inputs');
  }
  const session = createSession(gameEngine);
  function submit(type: string, payload: unknown = null) {
    const s = session.state;
    const setup = s.setup;
    const result = session.submit({
      type, payload, commandId: `fixture-${s.revision}` as never,
      actor: setup ? { kind: 'player', id: setup.playerId } : { kind: 'system' },
      expected: setup ? { kind: 'target', target: { kind: 'setupRoll', id: setup.setupRollId } }
        : { kind: 'revision', revision: s.revision },
    }, { now: timestamp(now), entropy: entropy([1, 2, 3, 4]) });
    if (result.kind !== 'accepted') throw new Error(result.error.code);
  }
  submit('CreateGame', { seed: 42, rulesVersion: CURRENT_RULES_VERSION });
  for (const playerId of ids) submit('AddPlayer', { playerId });
  submit('StartGame');
  for (let i = 0; session.state.setup && i < 100; i++) submit('RollForOrder');
  if (!session.state.turn) throw new Error('Fixture setup did not finish');
  let state = session.state;
  const payer = state.turn!.playerId;
  const owner = ids.find(id => id !== payer)! as PlayerId;
  const family = name === 'logistics-rent' ? 'logistics' : name === 'energy-rent' ? 'energy' : 'monopoly';
  const cell = state.board!.cells.find(c => c.kind === family)!;
  const asset = cell.asset!;
  const holdings = name === 'building' || name === 'full-group-rent'
    ? state.board!.cells.filter(c => c.asset?.groupId === asset.groupId)
    : name === 'logistics-rent' ? state.board!.cells.filter(c => c.kind === family).slice(0, 2) : [cell];
  const owns = name === 'building' || name === 'own-asset' ? payer : owner;
  state = { ...state, owners: Object.fromEntries(holdings.map(c => [c.asset!.assetId, owns])),
    positions: { ...state.positions, [payer]: cell.index },
    turn: { ...state.turn!, rolled: name !== 'building' } };
  if (name === 'shortfall') state = { ...state, balances: { ...state.balances, [payer]: 10 as Money } };
  if (name !== 'building' && name !== 'own-asset') {
    const diceSum = family === 'energy' ? 7 : null;
    state = { ...state, rent: { payerId: payer, ownerId: owner, assetId: asset.assetId,
      cell: cell.index, kind: family === 'monopoly' ? 'regular' : family,
      amount: rentFor(state, asset.assetId, diceSum), diceSum } };
  }
  checkInvariants(state);
  return state;
}
