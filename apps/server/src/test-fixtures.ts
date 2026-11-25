import {
  casinoCap, checkInvariants, CLASSIC_40, createSession, CURRENT_RULES_VERSION, entropy, gameEngine, houseCost, houseRefund, mortgageAdvance,
  rentFor, timestamp, type BoardCell, type GameState, type Mortgage, type PlayerId, type Money,
} from '@game/game-core';

/** Stage 5 scenarios: mortgage terms, debt liquidation tiers and bankruptcy. */
export const STAGE5_FIXTURE_NAMES = ['mortgage-expiry', 'liquidation-tier-1', 'liquidation-tier-2',
  'liquidation-tier-3', 'bankruptcy', 'final-bankruptcy', 'mortgage-restart',
  'liquidation-multi-tier', 'bankruptcy-houses'] as const;
type Stage5FixtureName = typeof STAGE5_FIXTURE_NAMES[number];
export const STAGE6_FIXTURE_NAMES = ['jail-choice', 'casino-decision', 'open-charge', 'redeem-locked', 'pre-roll-chance', 'chance-liquidation', 'stage6-restart', 'jail-third-attempt', 'pre-roll-go-to-jail', 'pre-roll-go-to-jail-double4', 'redeem-bonus'] as const;
type Stage6FixtureName = typeof STAGE6_FIXTURE_NAMES[number];

export const FIXTURE_NAMES = ['regular-rent', 'full-group-rent', 'logistics-rent', 'energy-rent',
  'own-asset', 'shortfall', 'building', 'open-rent', 'bonus-building',
  'pre-roll-regular-rent', 'pre-roll-full-group-rent', 'pre-roll-logistics-rent',
  'pre-roll-energy-rent', 'pre-roll-own-asset', 'pre-roll-shortfall',
  ...STAGE5_FIXTURE_NAMES, ...STAGE6_FIXTURE_NAMES] as const;
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
  if ((STAGE6_FIXTURE_NAMES as readonly string[]).includes(name)) {
    return stage6Fixture(name as Stage6FixtureName, session);
  }
  if ((STAGE5_FIXTURE_NAMES as readonly string[]).includes(name)) {
    return stage5Fixture(name as Stage5FixtureName, session, now);
  }
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

function stage6Fixture(name: Stage6FixtureName, session: FixtureSession): GameState {
  const state = session.state;
  const playerId = state.turn!.playerId;
  const nextAsset = state.board!.cells.find(cell => cell.asset)!;
  if (name === 'jail-choice' || name === 'jail-third-attempt') {
    const attemptsUsed = name === 'jail-third-attempt' ? 2 : 1;
    const next = { ...state, jail: { ...state.jail, [playerId]: { attemptsUsed } }, positions: { ...state.positions, [playerId]: CLASSIC_40.jailCell }, turn: { ...state.turn!, rolled: false } };
    checkInvariants(next);
    return next;
  }
  if (name === 'casino-decision') {
    const cap = casinoCap(state.economy);
    const casino = CLASSIC_40.cells.find(cell => cell.kind === 'casino')!;
    const next = { ...state, positions: { ...state.positions, [playerId]: casino.index },
      turn: { ...state.turn!, rolled: true }, casino: { playerId, turnId: state.turn!.turnId, cap } };
    checkInvariants(next);
    return next;
  }
  if (name === 'open-charge') {
    const next = { ...state, turn: { ...state.turn!, rolled: true }, charge: { payerId: playerId, amount: 100 as Money, cause: 'chance' as const } };
    checkInvariants(next);
    return next;
  }
  if (name === 'pre-roll-chance') {
    const target = CLASSIC_40.cells.find(cell => cell.kind === 'chance')!;
    const next = { ...state, positions: { ...state.positions, [playerId]: (target.index + 40 - 7) % 40 }, turn: { ...state.turn!, rolled: false } };
    checkInvariants(next);
    return next;
  }
  if (name === 'chance-liquidation') {
    const target = CLASSIC_40.cells.find(cell => cell.kind === 'chance' && cell.index > 7)!;
    const holdings = state.board!.cells.filter(cell => cell.asset);
    const next = { ...state, owners: Object.fromEntries(holdings.map(cell => [cell.asset!.assetId, playerId])),
      balances: { ...state.balances, [playerId]: 0 as Money },
      positions: { ...state.positions, [playerId]: (target.index + 40 - 7) % 40 }, turn: { ...state.turn!, rolled: false } };
    checkInvariants(next);
    return next;
  }
  if (name === 'stage6-restart') {
    const mortgage = { advance: mortgageAdvance(nextAsset.asset!.price), lapsCompleted: 0, pending: [...state.order!], lockedTurnId: state.turn!.turnId };
    const next = { ...state, turn: { ...state.turn!, rolled: false },
      jail: { ...state.jail, [playerId]: { attemptsUsed: 1 } }, positions: { ...state.positions, [playerId]: CLASSIC_40.jailCell },
      owners: { ...state.owners, [nextAsset.asset!.assetId]: playerId }, mortgages: { ...state.mortgages, [nextAsset.asset!.assetId]: mortgage } };
    checkInvariants(next);
    return next;
  }
  if (name === 'pre-roll-go-to-jail' || name === 'pre-roll-go-to-jail-double4') {
    const target = CLASSIC_40.cells.find(cell => cell.kind === 'go-to-jail')!;
    const diceSum = name === 'pre-roll-go-to-jail-double4' ? 4 : 6;
    const next = { ...state, positions: { ...state.positions, [playerId]: (target.index + 40 - diceSum) % 40 }, turn: { ...state.turn!, rolled: false } };
    checkInvariants(next);
    return next;
  }
  if (name === 'redeem-bonus') {
    const mortgage = { advance: mortgageAdvance(nextAsset.asset!.price), lapsCompleted: 0, pending: [...state.order!], lockedTurnId: state.turn!.turnId };
    const next = { ...state, owners: { ...state.owners, [nextAsset.asset!.assetId]: playerId },
      mortgages: { ...state.mortgages, [nextAsset.asset!.assetId]: mortgage },
      positions: { ...state.positions, [playerId]: 0 }, turn: { ...state.turn!, rolled: true, doublesStreak: 1, pendingBonus: true } };
    checkInvariants(next);
    return next;
  }
  const mortgage = { advance: mortgageAdvance(nextAsset.asset!.price), lapsCompleted: 0, pending: [...state.order!], lockedTurnId: state.turn!.turnId };
  const next = { ...state, turn: { ...state.turn!, rolled: true }, owners: { ...state.owners, [nextAsset.asset!.assetId]: playerId },
    mortgages: { ...state.mortgages, [nextAsset.asset!.assetId]: mortgage } };
  checkInvariants(next);
  return next;
}

type FixtureSession = ReturnType<typeof createSession>;

/**
 * Stage 5 genesis after real setup. The payer is the active player and the
 * creditor the next seat in turn order. `final-bankruptcy` first resigns every
 * other seat through the core so exactly two players stay active.
 */
function stage5Fixture(name: Stage5FixtureName, session: FixtureSession, now: number): GameState {
  const order = session.state.order!;
  const payer = session.state.turn!.playerId;
  const creditor = order[(order.indexOf(payer) + 1) % order.length]!;
  if (name === 'final-bankruptcy') {
    for (const playerId of order.filter(id => id !== payer && id !== creditor)) {
      const s = session.state;
      const result = session.submit({ type: 'Resign', payload: null, commandId: `fixture-${s.revision}` as never,
        actor: { kind: 'player', id: playerId }, expected: { kind: 'revision', revision: s.revision } },
      { now: timestamp(now), entropy: entropy([1, 2, 3, 4]) });
      if (result.kind !== 'accepted') throw new Error(result.error.code);
    }
  }
  let state = session.state;
  const cells = state.board!.cells;
  const groups = [...new Set(cells.filter(c => c.kind === 'monopoly').map(c => c.asset!.groupId))];
  const groupCells = (id: string) => cells.filter(c => c.asset?.groupId === id);
  /** The payer's holdings: the cheapest regular group. The creditor's: the most expensive one. */
  const payerGroup = groupCells(groups[0]!);
  const creditorGroup = groupCells(groups.at(-1)!);
  const term = (cell: BoardCell, lapsCompleted: number, pending: readonly PlayerId[]): Mortgage =>
    ({ advance: mortgageAdvance(cell.asset!.price), lapsCompleted, pending, lockedTurnId: null });
  const own = (holdings: readonly BoardCell[], owner: PlayerId) =>
    Object.fromEntries(holdings.map(c => [c.asset!.assetId, owner]));

  if (name === 'mortgage-expiry' || name === 'mortgage-restart') {
    // A rolled turn without settlement: EndTurn or the turn Timeout closes it.
    // The payer is the last pending player of the final lap of `expiring`.
    const expiring = payerGroup[0]!;
    const mortgages: Record<string, Mortgage> = { [expiring.asset!.assetId]: term(expiring, 7, [payer]) };
    let owners = own([expiring], payer);
    if (name === 'mortgage-restart') {
      const later = creditorGroup[0]!;
      mortgages[later.asset!.assetId] = term(later, 3, [...order]);
      owners = { ...owners, ...own([later], creditor) };
    }
    state = { ...state, owners, mortgages, turn: { ...state.turn!, rolled: true } };
    checkInvariants(state);
    return state;
  }

  // An open rent on the creditor's complete group, due from the payer. The
  // browser-only multi-step scenarios put one house on the rent asset so the
  // debt exceeds what several liquidation steps raise.
  const rentCell = creditorGroup[0]!;
  const rentAsset = rentCell.asset!;
  const multiStep = name === 'liquidation-multi-tier' || name === 'bankruptcy-houses';
  const creditorHouses: Record<string, number> = multiStep ? { [rentAsset.assetId]: 1 } : {};
  state = { ...state, owners: own(creditorGroup, creditor), houses: creditorHouses,
    positions: { ...state.positions, [payer]: rentCell.index },
    turn: { ...state.turn!, rolled: true } };
  const amount = rentFor(state, rentAsset.assetId, null);
  let houses: Record<string, number> = { ...creditorHouses };
  let mortgages: Record<string, Mortgage> = {};
  let holdings: readonly BoardCell[];
  let balance: number;
  if (multiStep) {
    // The payer's complete cheapest group: one house on its first asset, every
    // sibling already mortgaged. `liquidation-multi-tier` adds one bare asset
    // of an incomplete group, so the order is tier 1 mortgage, tier 3 house
    // sale, tier 3 mortgage of the now bare asset. `bankruptcy-houses` holds
    // less than the debt even after selling the house and mortgaging the asset.
    const [built, ...siblings] = payerGroup;
    const loose = groupCells(groups[1]!)[0]!;
    holdings = name === 'liquidation-multi-tier' ? [...payerGroup, loose] : payerGroup;
    houses = { ...houses, [built!.asset!.assetId]: 1 };
    mortgages = Object.fromEntries(siblings.map(c => [c.asset!.assetId, term(c, 0, [...state.order!])]));
    const refund = houseRefund(houseCost(built!.asset!.price));
    balance = name === 'liquidation-multi-tier'
      ? amount - mortgageAdvance(loose.asset!.price) - refund - 10
      : 10;
    if (name === 'bankruptcy-houses' && balance + refund + mortgageAdvance(built!.asset!.price) >= amount) {
      throw new Error('Fixture bankruptcy-houses must stay insolvent');
    }
  } else if (name === 'bankruptcy' || name === 'final-bankruptcy') {
    // Cash 10 and one already mortgaged asset: nothing left to raise, so the
    // creditor receives 10 and the asset returns to the bank.
    holdings = [payerGroup[0]!];
    mortgages = { [payerGroup[0]!.asset!.assetId]: term(payerGroup[0]!, 0, [...state.order!]) };
    balance = 10;
  } else {
    // Ten short: one step of the named tier covers the debt.
    holdings = name === 'liquidation-tier-1' ? [payerGroup[0]!] : payerGroup;
    if (name === 'liquidation-tier-3') houses = Object.fromEntries(payerGroup.map(c => [c.asset!.assetId, 1]));
    balance = amount - 10;
  }
  if (balance >= amount || balance < 0) throw new Error(`Fixture ${name} needs a shortfall`);
  state = { ...state, owners: { ...state.owners, ...own(holdings, payer) }, houses, mortgages,
    balances: { ...state.balances, [payer]: balance as Money },
    rent: { payerId: payer, ownerId: creditor, assetId: rentAsset.assetId, cell: rentCell.index,
      kind: 'regular', amount, diceSum: null } };
  checkInvariants(state);
  return state;
}
