/**
 * DEV-ONLY stand-in for the room's game. It is NOT a rules implementation:
 * it replays the scripted dice of `script.ts` and produces views and events in
 * the shapes game-core defines, enough to demo every screen. The real server
 * runs `@game/game-core`; nothing here ships in the client bundle.
 */
import { generateBoard, seedRng, startingCapital, lapReward, creditBalance, CLASSIC_40, SETUP_ROLL_TARGET_KIND, TURN_TARGET_KIND } from '@game/game-core';
import type { Expectation, GameEvent, PlayerId, Revision, StateView, Timestamp } from '@game/game-core';
import type { ClientCommandType, ErrorBody } from '@game/protocol';
import { ORDER_DICE, TURN_DICE } from './script';

export interface MockGameOptions {
  /** Length of an order roll and of a turn. */
  readonly turnMs: number;
  /** Extra time after a timed-out player was rolled for. */
  readonly continuationMs: number;
}

export type MockResult =
  | { readonly ok: true; readonly events: readonly GameEvent[] }
  | { readonly ok: false; readonly error: ErrorBody };

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

const reject = (code: string, message: string): MockResult => ({ ok: false, error: { code, message } });

export class MockGame {
  private state: Mutable<StateView> = {
    revision: 1 as Revision,
    rulesVersion: 'mock',
    phase: 'lobby',
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
  command(playerId: string, type: ClientCommandType, expected: Expectation, now: number): MockResult {
    const { setup, turn } = this.state;
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

  private accept(events: GameEvent[]): MockResult {
    return { ok: true, events: this.bumped(events) };
  }

  private bumped(events: GameEvent[]): GameEvent[] {
    this.bump();
    return events;
  }

  private bump(): void {
    this.state.revision = (this.state.revision + 1) as Revision;
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
    const value = ORDER_DICE[this.orderDie++ % ORDER_DICE.length]!;
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
    events.push(this.startTurn(order[0]!, false, 0, now));
    return events;
  }

  private startTurn(playerId: PlayerId, bonus: boolean, doublesStreak: number, now: number): GameEvent {
    const turnId = this.nextId('t');
    const deadline = (now + this.options.turnMs) as Timestamp;
    this.state.turn = {
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
    const dice = TURN_DICE[this.turnDie++ % TURN_DICE.length]!;
    const double = dice[0] === dice[1];
    const events: GameEvent[] = [{ type: 'DiceRolled', payload: { turnId: turn.turnId, playerId, dice, double, auto } }];
    const rolled = { ...turn, rolled: true, doublesStreak: 0, pendingBonus: false };

    if (Object.hasOwn(this.state.jail, playerId)) {
      const attemptsUsed = this.state.jail[playerId]!.attemptsUsed + 1;
      if (!double && attemptsUsed < 3) {
        this.state.jail = { ...this.state.jail, [playerId]: { attemptsUsed } };
        events.push({ type: 'InterimJailAttemptFailed', payload: { playerId, attemptsUsed } });
      } else {
        const { [playerId]: _released, ...jail } = this.state.jail;
        this.state.jail = jail;
        events.push({ type: 'InterimJailReleased', payload: { playerId, reason: double ? 'double' : 'attempts-exhausted' } });
        events.push(...this.move(playerId, dice[0] + dice[1]));
      }
      this.state.turn = rolled;
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
    return { events, closed: false };
  }
}

function matches(expected: Expectation, kind: string, id: string): boolean {
  return expected.kind === 'target' && expected.target.kind === kind && expected.target.id === id;
}
