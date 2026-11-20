/**
 * DEV-ONLY stand-in for the room's game. It is NOT a rules implementation:
 * it replays the scripted dice of `script.ts` and produces views and events in
 * the shapes game-core defines, enough to demo every screen. The real server
 * runs `@game/game-core`; nothing here ships in the client bundle.
 */
import { gameEngine, projectState, mortgageAdvance, rentFor, rentQuotes, timestamp, entropy, CURRENT_RULES_VERSION, generateBoard, seedRng, startingCapital, lapReward, creditBalance, CLASSIC_40, SETUP_ROLL_TARGET_KIND, TURN_TARGET_KIND } from '@game/game-core';
import type { AssetId, CommandId, Expectation, GameEvent, GameState, Money, PlayerId, Revision, StateView, Timestamp } from '@game/game-core';
import type { ClientCommandType, ErrorBody } from '@game/protocol';
import { ORDER_DICE, TURN_DICE, STAGE4_ORDER_DICE, STAGE4_TURN_DICE, STAGE4_SEED, STAGE5_ORDER_DICE, STAGE5_SEED, STAGE5_TURN_DICE } from './script';

export interface MockGameOptions {
  /** Length of an order roll and of a turn. */
  readonly turnMs: number;
  /** Extra time after a timed-out player was rolled for. */
  readonly continuationMs: number;
  /**
   * `stage4`: once play starts, the first two players get the owners and
   * houses of `STAGE4_SEED` and the dice of `STAGE4_TURN_DICE`, to demo rent
   * and building. `stage5`: three seats get `STAGE5_SEED` and the dice of
   * `STAGE5_TURN_DICE` for mortgages, liquidation, bankruptcy and the end;
   * every EndTurn then runs in game-core, which closes mortgage laps.
   */
  readonly scenario?: 'stage4' | 'stage5';
}

export type MockResult =
  | { readonly ok: true; readonly events: readonly GameEvent[] }
  | { readonly ok: false; readonly error: ErrorBody };

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

const reject = (code: string, message: string): MockResult => ({ ok: false, error: { code, message } });

export class MockGame {
  private state: Mutable<StateView> = {
    revision: 1 as Revision,
    rulesVersion: CURRENT_RULES_VERSION,
    phase: 'lobby',
    mortgages: {}, eliminations: [], finishedAt: null, result: null,
    houses: {}, rent: null, charge: null, casino: null, rentQuotes: {}, owners: {}, purchase: null, auction: null,
    board: generateBoard(seedRng(42)).board,
    economy: null,
    balances: {},
    players: [],
    eliminated: [],
    winner: null,
    setup: null,
    order: null,
    turn: null,
    positions: {},
    jail: {},
  };
  private orderDie = 0;
  private turnDie = 0;

  constructor(private readonly options: MockGameOptions) {}

  /** A detached copy of the current view. */
  get view(): StateView {
    return JSON.parse(JSON.stringify(this.state)) as StateView;
  }

  get revision(): Revision {
    return this.state.revision;
  }

  /** The player the game is waiting for, and until when. */
  get waitingFor(): { playerId: PlayerId; deadline: number } | null {
    if (this.state.auction !== null) return { playerId: this.state.auction.responder, deadline: this.state.auction.responseDeadline };
    if (this.state.setup !== null) return { playerId: this.state.setup.playerId, deadline: this.state.setup.deadline };
    if (this.state.turn !== null) return { playerId: this.state.turn.playerId, deadline: this.state.turn.deadline };
    return null;
  }

  addPlayer(playerId: string): GameEvent[] {
    this.state.players = [...this.state.players, { id: playerId as PlayerId }];
    this.bump();
    return [{ type: 'PlayerAdded', payload: { playerId } }];
  }

  leave(playerId: string): GameEvent[] {
    this.state.players = this.state.players.filter((p) => p.id !== playerId);
    return this.bumped([{ type: 'PlayerLeftLobby', payload: { playerId } }]);
  }

  private resign(playerId: PlayerId, expected: Expectation, now: number): MockResult {
    if (this.state.phase !== 'setup' && this.state.phase !== 'playing') return reject('PHASE_NOT_ALLOWED', 'The game is not active');
    if (expected.kind !== 'revision' || expected.revision !== this.revision) return reject('REVISION_MISMATCH', 'The game changed; try again');
    if (this.state.eliminated.includes(playerId)) return reject('PLAYER_ELIMINATED', 'You are already out');
    if (!this.state.players.some((p) => p.id === playerId)) return reject('NOT_A_PARTICIPANT', 'Unknown player');
    this.state.eliminated = [...this.state.eliminated, playerId];
    const events: GameEvent[] = [{ type: 'PlayerResigned', payload: { playerId } }];
    const active = this.state.players.map((p) => p.id).filter((id) => !this.state.eliminated.includes(id));
    const { [playerId]: _position, ...positions } = this.state.positions;
    const { [playerId]: _jail, ...jail } = this.state.jail;
    this.state.positions = positions;
    this.state.jail = jail;
    if (active.length === 1) {
      this.state.phase = 'finished';
      this.state.winner = active[0]!;
      this.state.setup = null;
      this.state.turn = null;
      this.state.order = this.state.order?.filter((id) => id !== playerId) ?? null;
      events.push({ type: 'GameEnded', payload: { winner: active[0]! } });
    } else if (this.state.setup !== null) {
      // Development script restarts active participants' order rolls after a resignation.
      events.push(this.openRoll([active], { groupIndex: 0, pending: active, rolls: {} }, now));
    } else {
      this.state.order = this.state.order!.filter((id) => id !== playerId);
      if (this.state.turn?.playerId === playerId) events.push(this.startTurn(this.state.order[0]!, false, 0, now));
    }
    return this.accept(events);
  }

  start(now: number): GameEvent[] {
    const everyone = this.state.players.map((p) => p.id);
    this.state.phase = 'setup';
    const capital = startingCapital(everyone.length);
    this.state.economy = { startingCapital: capital, lapReward: lapReward(capital) };
    const events: GameEvent[] = [{ type: 'GameStarted', payload: { playerIds: everyone } }];
    for (const id of everyone) events.push(this.credit(id, capital, 'starting-capital'));
    events.push(this.openRoll([everyone], { groupIndex: 0, pending: everyone, rolls: {} }, now));
    this.bump();
    return events;
  }

  /** A player's command: checks the target, whose turn it is and the deadline, then plays the script. */
  command(playerId: string, type: ClientCommandType, expected: Expectation, now: number, payload: unknown = null): MockResult {
    const { setup, turn } = this.state;
    const coreTypes: readonly string[] = ['BuyAsset', 'StartAuction', 'Bid', 'PassAuction', 'PayRent', 'BuildHouse', 'SellHouse', 'Mortgage', 'Redeem'];
    const settling = this.state.purchase !== null || this.state.rent !== null || (this.options.scenario === 'stage5' && this.state.turn !== null);
    if (this.state.auction !== null || coreTypes.includes(type) || ((type === 'EndTurn' || type === 'Resign') && settling)) return this.coreCommand(playerId, type, expected, now, payload);
    if (type === 'Resign') return this.resign(playerId as PlayerId, expected, now);
    if (this.state.eliminated.includes(playerId as PlayerId)) return reject('PLAYER_ELIMINATED', 'You are out');
    if (type === 'RollForOrder') {
      if (setup === null) return reject('PHASE_NOT_ALLOWED', `RollForOrder is not allowed in phase "${this.state.phase}"`);
      if (!matches(expected, SETUP_ROLL_TARGET_KIND, setup.setupRollId)) {
        return reject('TARGET_MISMATCH', `Current setupRoll target is ${setup.setupRollId}`);
      }
      if (playerId !== setup.playerId) return reject('NOT_ACTIVE_PLAYER', `Only ${setup.playerId} may roll for order now`);
      if (now >= setup.deadline) return reject('DEADLINE_PASSED', `Order roll ${setup.setupRollId} expired`);
      return this.accept(this.rollForOrder(now, false));
    }
    if (turn === null) return reject('PHASE_NOT_ALLOWED', `${type} is not allowed in phase "${this.state.phase}"`);
    if (!matches(expected, TURN_TARGET_KIND, turn.turnId)) {
      return reject('TARGET_MISMATCH', `Current turn target is ${turn.turnId}`);
    }
    if (playerId !== turn.playerId) return reject('NOT_ACTIVE_PLAYER', `Turn ${turn.turnId} belongs to ${turn.playerId}`);
    if (now >= turn.deadline) return reject('DEADLINE_PASSED', `Turn ${turn.turnId} expired`);
    if (type === 'RollDice') {
      if (turn.rolled) return reject('ALREADY_ROLLED', `Turn ${turn.turnId} has already rolled`);
      return this.accept(this.roll(now, false).events);
    }
    if (!turn.rolled) return reject('ROLL_REQUIRED', `Turn ${turn.turnId} must roll before ending`);
    return this.accept(this.closeTurn('end-turn', now));
  }

  /** The deadline passed: roll for the player, or close a turn that had rolled. Null when nothing is due. */
  timeout(now: number): GameEvent[] | null {
    const { setup, turn } = this.state;
    if (this.state.auction !== null || ((this.state.purchase !== null || this.state.rent !== null) && turn !== null && now >= turn.deadline)) {
      const a = this.state.auction;
      const deadline = a?.responseDeadline ?? turn!.deadline;
      if (now < deadline) return null;
      const result = this.coreCommand(null, 'Timeout', { kind: 'target', target: a ? { kind: 'auctionResponse', id: a.responseId } : { kind: 'turn', id: turn!.turnId } }, now);
      return result.ok ? [...result.events] : null;
    }
    if (setup !== null) {
      if (now < setup.deadline) return null;
      return this.bumped(this.rollForOrder(now, true));
    }
    if (turn === null || now < turn.deadline) return null;
    if (turn.rolled) return this.bumped(this.closeTurn('timeout', now));
    const rolled = this.roll(now, true);
    if (rolled.closed || this.state.turn === null) return this.bumped(rolled.events);
    const deadline = (now + this.options.continuationMs) as Timestamp;
    this.state.turn = { ...this.state.turn, deadline, continuation: true };
    return this.bumped([...rolled.events, { type: 'TurnContinued', payload: { turnId: turn.turnId, deadline } }]);
  }

  /** The view with a fixed rng, as the core state the mock hands to game-core. */
  private get core(): GameState {
    return { ...this.state, rng: seedRng(42) };
  }

  /**
   * Acquisition, rent and building commands and their deadlines use the real
   * core; scripted movement mirrors the offer and rent triggers below.
   */
  private coreCommand(playerId: string | null, type: string, expected: Expectation, now: number, payload: unknown = null): MockResult {
    const result = gameEngine.execute(this.core, {
      type, commandId: `mock-${this.revision + 1}` as CommandId,
      actor: playerId === null ? { kind: 'system' } : { kind: 'player', id: playerId as PlayerId }, expected, payload,
    }, { now: timestamp(now), entropy: entropy([1, 2, 3, 4]) });
    if (result.kind === 'rejected') return { ok: false, error: result.error };
    this.state = projectState(result.state, { kind: 'spectator' });
    return { ok: true, events: result.events };
  }

  private offer(playerId: PlayerId, events: GameEvent[]): void {
    const cell = this.state.board!.cells[this.state.positions[playerId]!]!;
    if (cell.asset === null || this.state.owners[cell.asset.assetId] !== undefined) return;
    this.state.purchase = { playerId, cell: cell.index, assetId: cell.asset.assetId };
    events.push({ type: 'PurchaseOffered', payload: this.state.purchase });
  }

  /** Mirrors core rent.ts offerRent: an owned asset of another player opens a settlement priced by game-core. */
  private offerRent(playerId: PlayerId, diceSum: number, events: GameEvent[]): void {
    const cell = this.state.board!.cells[this.state.positions[playerId]!]!;
    if (cell.asset === null || this.state.purchase !== null) return;
    const ownerId = this.state.owners[cell.asset.assetId];
    const amount = rentFor(this.core, cell.asset.assetId, diceSum);
    if (ownerId === undefined || ownerId === playerId || amount === 0) return;
    const kind: NonNullable<StateView['rent']>['kind'] = cell.kind === 'monopoly' ? 'regular' : (cell.kind as 'energy' | 'logistics');
    const payload = { payerId: playerId, ownerId, assetId: cell.asset.assetId, kind, amount, diceSum: kind === 'energy' ? diceSum : null };
    this.state.rent = { ...payload, cell: cell.index };
    events.push({ type: 'RentDue', payload });
  }

  /** The `stage4` scenario: owners and houses for the first two players. */
  private seedStage4(): void {
    const [first, second] = this.state.players.map((p) => p.id);
    if (first === undefined || second === undefined) return;
    const assetAt = (index: number): AssetId => this.state.board!.cells[index]!.asset!.assetId;
    const seat = [first, second];
    this.state.owners = Object.fromEntries(STAGE4_SEED.owners.flatMap((cells, i) => cells.map((index) => [assetAt(index), seat[i]!])));
    this.state.houses = Object.fromEntries(Object.entries(STAGE4_SEED.houses).map(([index, n]) => [assetAt(Number(index)), n]));
  }

  /** The `stage5` scenario: cash, positions, owners, houses and mortgages for the first three players. */
  private seedStage5(): void {
    const seats = this.state.players.map((p) => p.id).slice(0, STAGE5_SEED.length);
    if (seats.length < STAGE5_SEED.length) return;
    const cellAt = (index: number) => this.state.board!.cells[index]!.asset!;
    const order = this.state.order!;
    this.state.owners = {}; this.state.houses = {}; this.state.mortgages = {};
    STAGE5_SEED.forEach((seed, i) => {
      const id = seats[i]!;
      this.state.balances = { ...this.state.balances, [id]: seed.cash as Money };
      this.state.positions = { ...this.state.positions, [id]: seed.position };
      for (const index of seed.owners) this.state.owners = { ...this.state.owners, [cellAt(index).assetId]: id };
      for (const [index, n] of Object.entries(seed.houses)) this.state.houses = { ...this.state.houses, [cellAt(Number(index)).assetId]: n };
      for (const [index, laps] of Object.entries(seed.mortgages)) {
        const asset = cellAt(Number(index));
        this.state.mortgages = { ...this.state.mortgages, [asset.assetId]: { advance: mortgageAdvance(asset.price), lapsCompleted: laps, pending: [...order], remainingLaps: 8 - laps } };
      }
    });
  }

  private accept(events: GameEvent[]): MockResult {
    return { ok: true, events: this.bumped(events) };
  }

  private bumped(events: GameEvent[]): GameEvent[] {
    this.bump();
    return events;
  }

  private bump(): void {
    this.state.revision = (this.state.revision + 1) as Revision;
    // Quotes are derived by game-core from owners and houses, as in a projection.
    this.state.rentQuotes = rentQuotes(this.core);
  }

  /** Ids derive from the revision the current change produces, as in game-core. */
  private nextId(prefix: string): string {
    return `${prefix}${this.state.revision + 1}`;
  }

  private openRoll(
    groups: readonly (readonly PlayerId[])[],
    round: NonNullable<StateView['setup']>['round'],
    now: number,
  ): GameEvent {
    const playerId = round.pending[0]!;
    const deadline = (now + this.options.turnMs) as Timestamp;
    const setupRollId = this.nextId('s');
    this.state.setup = { setupRollId, playerId, deadline, groups, round };
    return { type: 'OrderRollStarted', payload: { setupRollId, playerId, deadline } };
  }

  private rollForOrder(now: number, auto: boolean): GameEvent[] {
    const setup = this.state.setup!;
    const orderDice = this.options.scenario === 'stage4' ? STAGE4_ORDER_DICE : this.options.scenario === 'stage5' ? STAGE5_ORDER_DICE : ORDER_DICE;
    const value = orderDice[this.orderDie++ % orderDice.length]!;
    const playerId = setup.playerId;
    const events: GameEvent[] = [{ type: 'OrderDieRolled', payload: { playerId, value, auto } }];
    const rolls = { ...setup.round.rolls, [playerId]: value };
    const pending = setup.round.pending.slice(1);
    if (pending.length > 0) {
      events.push(this.openRoll(setup.groups, { groupIndex: setup.round.groupIndex, pending, rolls }, now));
      return events;
    }

    const group = setup.groups[setup.round.groupIndex]!;
    const values = [...new Set(group.map((p) => rolls[p]!))].sort((a, b) => b - a);
    const buckets = values.map((v) => group.filter((p) => rolls[p] === v));
    buckets.forEach((bucket, i) => {
      if (bucket.length > 1) events.push({ type: 'OrderTied', payload: { playerIds: bucket, value: values[i]! } });
    });
    const groups = [...setup.groups.slice(0, setup.round.groupIndex), ...buckets, ...setup.groups.slice(setup.round.groupIndex + 1)];
    const groupIndex = groups.findIndex((g) => g.length > 1);
    if (groupIndex >= 0) {
      events.push(this.openRoll(groups, { groupIndex, pending: groups[groupIndex]!, rolls: {} }, now));
      return events;
    }

    const order = groups.map((g) => g[0]!);
    events.push({ type: 'TurnOrderDetermined', payload: { order } });
    this.state.setup = null;
    this.state.phase = 'playing';
    this.state.order = order;
    this.state.positions = Object.fromEntries(order.map((p) => [p, CLASSIC_40.startCell]));
    this.state.jail = {};
    if (this.options.scenario === 'stage4') this.seedStage4();
    if (this.options.scenario === 'stage5') this.seedStage5();
    events.push(this.startTurn(order[0]!, false, 0, now));
    return events;
  }

  private startTurn(playerId: PlayerId, bonus: boolean, doublesStreak: number, now: number): GameEvent {
    const turnId = this.nextId('t');
    const deadline = (now + this.options.turnMs) as Timestamp;
    this.state.turn = {
      pausedRemainingMs: null,
      turnId,
      playerId,
      deadline,
      bonus,
      rolled: false,
      continuation: false,
      doublesStreak,
      pendingBonus: false,
      quotas: { builds: 1, offers: 2 },
    };
    return { type: 'TurnStarted', payload: { turnId, playerId, deadline, bonus } };
  }

  private closeTurn(reason: 'end-turn' | 'timeout' | 'sent-to-jail', now: number): GameEvent[] {
    const turn = this.state.turn!;
    const ended: GameEvent = { type: 'TurnEnded', payload: { turnId: turn.turnId, playerId: turn.playerId, reason } };
    if (turn.pendingBonus) return [ended, this.startTurn(turn.playerId, true, turn.doublesStreak, now)];
    const order = this.state.order!;
    const next = order[(order.indexOf(turn.playerId) + 1) % order.length]!;
    return [ended, this.startTurn(next, false, 0, now)];
  }

  private credit(playerId: PlayerId, delta: Parameters<typeof creditBalance>[2], reason: Parameters<typeof creditBalance>[3]): GameEvent {
    const result = creditBalance(this.state.balances, playerId, delta, reason);
    this.state.balances = result.balances;
    return result.event;
  }

  private move(playerId: PlayerId, steps: number): GameEvent[] {
    const from = this.state.positions[playerId]!;
    const to = (from + steps) % CLASSIC_40.size;
    this.state.positions = { ...this.state.positions, [playerId]: to };
    const events: GameEvent[] = [{ type: 'PlayerMoved', payload: { playerId, from, to, steps } }];
    // Mirrors core board.ts movePlayer: reaching/passing Start pays once, including jail release.
    if (from + steps >= CLASSIC_40.size) events.push(this.credit(playerId, this.state.economy!.lapReward, 'lap-reward'));
    return events;
  }

  private roll(now: number, auto: boolean): { events: GameEvent[]; closed: boolean } {
    const turn = this.state.turn!;
    const playerId = turn.playerId;
    const turnDice = this.options.scenario === 'stage4' ? STAGE4_TURN_DICE : this.options.scenario === 'stage5' ? STAGE5_TURN_DICE : TURN_DICE;
    const dice = turnDice[this.turnDie++ % turnDice.length]!;
    const double = dice[0] === dice[1];
    const events: GameEvent[] = [{ type: 'DiceRolled', payload: { turnId: turn.turnId, playerId, dice, double, auto } }];
    const rolled = { ...turn, rolled: true, doublesStreak: 0, pendingBonus: false };

    if (Object.hasOwn(this.state.jail, playerId)) {
      const attemptsUsed = this.state.jail[playerId]!.attemptsUsed + 1;
      if (!double && attemptsUsed < 3) {
        this.state.jail = { ...this.state.jail, [playerId]: { attemptsUsed } };
        events.push({ type: 'JailAttemptFailed', payload: { playerId, attemptsUsed } });
      } else {
        const { [playerId]: _released, ...jail } = this.state.jail;
        this.state.jail = jail;
        events.push({ type: 'JailReleased', payload: { playerId, reason: double ? 'double' : 'fee-forced' } });
        events.push(...this.move(playerId, dice[0] + dice[1]));
      }
      this.state.turn = rolled;
      if (!Object.hasOwn(this.state.jail, playerId)) {
        this.offer(playerId, events);
        this.offerRent(playerId, dice[0] + dice[1], events);
      }
      return { events, closed: false };
    }

    if (double && turn.doublesStreak + 1 === 3) {
      const from = this.state.positions[playerId]!;
      const to = CLASSIC_40.jailCell;
      events.push({ type: 'SentToJail', payload: { playerId, from, to } });
      this.state.positions = { ...this.state.positions, [playerId]: to };
      this.state.jail = { ...this.state.jail, [playerId]: { attemptsUsed: 0 } };
      this.state.turn = rolled;
      events.push(...this.closeTurn('sent-to-jail', now));
      return { events, closed: true };
    }

    events.push(...this.move(playerId, dice[0] + dice[1]));
    this.state.turn = { ...rolled, doublesStreak: double ? turn.doublesStreak + 1 : 0, pendingBonus: double };
    this.offer(playerId, events);
    this.offerRent(playerId, dice[0] + dice[1], events);
    return { events, closed: false };
  }
}

function matches(expected: Expectation, kind: string, id: string): boolean {
  return expected.kind === 'target' && expected.target.kind === kind && expected.target.id === id;
}
