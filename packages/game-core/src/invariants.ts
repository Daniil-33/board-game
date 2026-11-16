import { CATALOG } from './catalog.js';
import { cellPrice } from './board/prices.js';
import { isWellFormedRng } from './rng.js';
import { MAX_PLAYERS, MIN_PLAYERS, type GameState } from './state.js';
import { CLASSIC_40 } from './board.js';

export type InvariantName =
  | 'revision-non-negative-integer'
  | 'unique-player-ids'
  | 'player-count-for-phase'
  | 'rng-well-formed'
  | 'phase-state-shape'
  | 'ring-position' | 'board-shape' | 'balances';

/**
 * Raised when an accepted transition produced a state that breaks an invariant.
 * This is an engine defect, never a rejection of a user command.
 */
export class InvariantViolationError extends Error {
  readonly invariant: InvariantName;
  readonly detail: string;

  constructor(invariant: InvariantName, detail: string) {
    super(`Invariant violated: ${invariant} (${detail})`);
    this.name = 'InvariantViolationError';
    this.invariant = invariant;
    this.detail = detail;
  }
}

/** Throws InvariantViolationError on the first broken invariant. */
export function checkInvariants(state: GameState): void {
  const rev: number = state.revision;
  if (!Number.isSafeInteger(rev) || rev < 0) {
    throw new InvariantViolationError('revision-non-negative-integer', `revision=${rev}`);
  }

  const seen = new Set<string>();
  for (const p of state.players) {
    if (seen.has(p.id)) {
      throw new InvariantViolationError('unique-player-ids', `duplicate id ${p.id}`);
    }
    seen.add(p.id);
  }

  const count = state.players.length;
  const [min, max] =
    state.phase === 'uninitialized' ? [0, 0] : state.phase === 'lobby' ? [0, MAX_PLAYERS] : [MIN_PLAYERS, MAX_PLAYERS];
  if (count < min || count > max) {
    throw new InvariantViolationError(
      'player-count-for-phase',
      `phase ${state.phase} allows ${min}..${max} players, has ${count}`,
    );
  }

  if (state.phase === 'uninitialized') {
    if (state.rng !== null) {
      throw new InvariantViolationError('rng-well-formed', 'rng must be null before CreateGame');
    }
  } else if (!isWellFormedRng(state.rng)) {
    throw new InvariantViolationError('rng-well-formed', `phase ${state.phase} requires a well-formed rng`);
  }

  checkBoard(state);
  checkBalances(state);
  checkPhaseShape(state);
}

function shape(detail: string): never {
  throw new InvariantViolationError('phase-state-shape', detail);
}

function sameMembers(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && new Set(a).size === a.length && a.every((x) => b.includes(x));
}

/** Phase-specific state is present exactly in its phase, and positions are ring cells. */
function checkPhaseShape(state: GameState): void {
  const members = state.players.map((p) => p.id as string);
  if (new Set(state.eliminated).size !== state.eliminated.length || state.eliminated.some((p) => !members.includes(p))) {
    shape('eliminated ids must be unique participants');
  }
  const ids = members.filter((p) => !state.eliminated.some((e) => e === p));
  const finished = state.phase === 'finished';
  if (finished) {
    if (ids.length !== 1 || state.winner !== ids[0]) shape('finished must have exactly one active player equal to winner');
  } else if (state.winner !== null) shape('winner must be null outside finished');
  if ((state.phase === 'setup' || state.phase === 'playing') && ids.length < MIN_PLAYERS) shape('setup and playing need two active players');
  if ((state.phase === 'lobby' || state.phase === 'uninitialized') && state.eliminated.length !== 0) shape('no eliminated players before setup');
  const inSetup = state.phase === 'setup';
  const playing = state.phase === 'playing';

  if ((state.setup !== null) !== inSetup) shape(`setup must be present exactly in phase setup (phase ${state.phase})`);
  if ((state.order !== null) !== playing) shape(`order must be present exactly in phase playing (phase ${state.phase})`);
  if ((state.turn !== null) !== playing) shape(`turn must be present exactly in phase playing (phase ${state.phase})`);

  const positioned = Object.keys(state.positions);
  if (playing ? !sameMembers(positioned, ids) : finished ? positioned.some((p) => !ids.includes(p)) : positioned.length > 0) {
    shape(`positions must name every player exactly in phase playing (phase ${state.phase})`);
  }
  for (const p of Object.keys(state.jail)) {
    if ((!playing && !finished) || !ids.includes(p)) shape(`jail entry for ${p} outside playing or for a non-player`);
  }

  if (state.setup !== null) {
    const { round, playerId, groups } = state.setup;
    if (round.pending[0] !== playerId) shape(`current roller ${playerId} is not first pending`);
    if (!sameMembers(groups.flat(), ids) || groups.some((g) => g.length === 0)) shape('order-roll groups must partition active players');
    const group = groups[round.groupIndex];
    if (!group || group.length < 2) shape('current round must name an unresolved group');
    const rolled = Object.keys(round.rolls);
    if (!sameMembers([...round.pending, ...rolled], group)) shape('pending and recorded rolls must partition the current group');
    if (Object.values(round.rolls).some((v) => !Number.isInteger(v) || v < 1 || v > 6)) shape('order rolls must be die values');
  }
  if (state.order !== null && state.turn !== null) {
    if (!sameMembers(state.order, ids)) shape('order must be a permutation of the players');
    if (!state.order.includes(state.turn.playerId)) shape(`turn owner ${state.turn.playerId} is not in order`);
  }

  for (const [p, cell] of Object.entries(state.positions)) {
    if (!Number.isInteger(cell) || cell < 0 || cell >= CLASSIC_40.size) {
      throw new InvariantViolationError('ring-position', `player ${p} on cell ${cell}`);
    }
  }
}

function checkBoard(state: GameState): void {
  const bad = (detail: string): never => { throw new InvariantViolationError('board-shape', detail); };
  if (state.phase === 'uninitialized') { if (state.board !== null) bad('Board before creation'); return; }
  const board = state.board;
  if (!board || board.layout !== 'CLASSIC_40' || board.catalogVersion !== 'ua-1' || board.priceTableVersion !== 'prices-1' || board.generatorVersion !== 'gen-1' || !Array.isArray(board.cells) || board.cells.length !== 40) return bad('Board metadata');
  const ids = new Set<string>(); const categories = new Map<number, string>();
  for (const layout of CLASSIC_40.cells) {
    const c = board.cells[layout.index];
    if (!c || c.index !== layout.index || c.kind !== layout.kind) return bad('Cell geometry');
    const assetCell = ['monopoly','logistics','energy'].includes(c.kind);
    if (!assetCell) { if (c.asset !== null) bad('Unexpected asset'); continue; }
    const a = c.asset;
    if (!a || ids.has(a.assetId)) return bad('Missing or duplicate asset');
    ids.add(a.assetId);
    const rank = layout.rank;
    const position = CLASSIC_40.cells.filter(x => x.rank === rank && x.index < c.index).length;
    if (a.rank !== rank || a.groupId !== (rank === null ? c.kind : `M${rank}`) || a.price !== cellPrice(c.kind, rank, position)) bad('Asset rank/group/price');
    const category = rank === null ? null : CATALOG.categories.find(x => x.id === a.categoryId);
    const pool = category?.companies ?? (c.kind === 'logistics' ? CATALOG.logistics : c.kind === 'energy' ? CATALOG.energy : []);
    if (!pool.some(x => x.id === a.assetId && x.name === a.name) || a.categoryName !== (category?.name ?? (c.kind === 'logistics' ? 'Логистика' : 'Энергетика')) || (rank === null && a.categoryId !== c.kind)) bad('Asset category/company');
    if (rank !== null) {
      if (!category) bad('Unknown category');
      if (categories.has(rank) && categories.get(rank) !== a.categoryId) bad('Mixed category');
      categories.set(rank, a.categoryId);
    }
  }
  if (new Set(categories.values()).size !== 8) bad('Repeated category');
}
function checkBalances(state: GameState): void {
  const bad = (): never => { throw new InvariantViolationError('balances', 'Invalid balances/economy'); };
  const started = ['setup','playing','finished'].includes(state.phase);
  if (!state.balances || typeof state.balances !== 'object' || Array.isArray(state.balances)) bad();
  const keys = Object.keys(state.balances);
  if (!started) { if (keys.length || state.economy !== null) bad(); return; }
  if (!state.economy || keys.length !== state.players.length || state.players.some(p => !Object.hasOwn(state.balances, p.id))) bad();
  const values = [...Object.values(state.balances), state.economy!.startingCapital, state.economy!.lapReward];
  if (values.some(v => !Number.isSafeInteger(v) || v < 0 || v % 10 !== 0)) bad();
}
