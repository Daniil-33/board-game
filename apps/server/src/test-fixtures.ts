import {
  checkInvariants, createSession, CURRENT_RULES_VERSION, entropy, gameEngine,
  rentFor, timestamp, type GameState, type PlayerId, type Money,
} from '@game/game-core';

export const FIXTURE_NAMES = ['regular-rent', 'full-group-rent', 'logistics-rent', 'energy-rent',
  'own-asset', 'shortfall', 'building', 'open-rent', 'bonus-building',
  'pre-roll-regular-rent', 'pre-roll-full-group-rent', 'pre-roll-logistics-rent',
  'pre-roll-energy-rent', 'pre-roll-own-asset', 'pre-roll-shortfall'] as const;
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
  if (name.startsWith('pre-roll-') || name === 'bonus-building') {
    const scenario = name.replace(/^pre-roll-/, '');
    const cells = state.board!.cells;
    const family = scenario === 'logistics-rent' ? 'logistics' : scenario === 'energy-rent' ? 'energy' : 'monopoly';
    const target = cells.find(c => c.kind === family && (family !== 'monopoly' ||
      c.index >= 7 && cells.find(x => x.asset?.groupId === c.asset!.groupId)?.index === c.index))!;
    const monopoly = cells.filter(c => c.kind === 'monopoly');
    const own = scenario === 'own-asset' || scenario === 'bonus-building';
    // Board generation stays untouched. Place the mover seven steps before the target:
    // a real sum of seven hits it, while nearby assets can also exercise the scenario.
    // A missed roll is retried from a fresh fixture by the bounded browser loop.
    const holdings = own ? cells.filter(c => c.asset)
      : scenario === 'full-group-rent' ? monopoly
      : scenario === 'logistics-rent' ? cells.filter(c => c.kind === family).slice(0, 2)
      : scenario === 'energy-rent' ? cells.filter(c => c.kind === family)
      : monopoly.filter(c => cells.filter(x => x.asset?.groupId === c.asset!.groupId).at(-1)?.index !== c.index);
    state = { ...state, owners: Object.fromEntries(holdings.map(c => [c.asset!.assetId, own ? payer : owner])),
      positions: { ...state.positions, [payer]: (target.index + 40 - 7) % 40 },
      turn: { ...state.turn!, rolled: false } };
    if (scenario === 'shortfall') state = { ...state, balances: { ...state.balances, [payer]: 10 as Money } };
    checkInvariants(state);
    return state;
  }
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
