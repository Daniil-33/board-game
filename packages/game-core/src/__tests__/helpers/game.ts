import { createSession, type Session } from '../../session.js';
import { gameEngine } from '../../rules.js';
import type { GameCommand, GameEvent, TransitionResult } from '../../engine.js';
import type { GameState } from '../../state.js';
import { pendingDeadlines } from '../../deadlines.js';
import { DEFAULT_ENTROPY, cmd, ctx, player } from './fixtures.js';
import { forceEntropy } from './dice.js';

export const T0 = 1_767_225_600_000;

type Result = TransitionResult<GameState, GameEvent>;

/** A session driven by a test, with its own clock. */
export class Game {
  readonly session: Session = createSession(gameEngine);
  now = T0;

  get state(): GameState {
    return this.session.state;
  }

  /** Submit `c` at `at` (default: the clock; an accepted later `at` advances it), forcing the next draw(s) to `dice` when given. */
  submit(c: GameCommand, opts: { at?: number | undefined; dice?: readonly number[] | undefined } = {}): Result {
    const at = opts.at ?? this.now;
    const e = opts.dice && this.state.rng ? forceEntropy(this.state.rng, opts.dice) : DEFAULT_ENTROPY;
    const r = this.session.submit(c, ctx(at, e));
    // The clock never runs backwards across accepted commands.
    if (r.kind === 'accepted') this.now = Math.max(this.now, at);
    return r;
  }

  /** Like `submit`, but fails the test unless accepted; returns the events. */
  ok(c: GameCommand, opts: { at?: number | undefined; dice?: readonly number[] | undefined } = {}): readonly GameEvent[] {
    const r = this.submit(c, opts);
    if (r.kind !== 'accepted') throw new Error(`${c.type} rejected: ${r.error.code} ${r.error.message}`);
    return r.events;
  }

  // ---- Command builders, always against the current state ----

  rollForOrderCmd(by: string): GameCommand {
    return cmd('RollForOrder', null, { actor: player(by), target: { kind: 'setupRoll', id: this.state.setup!.setupRollId } });
  }
  rollDiceCmd(by?: string): GameCommand {
    const turn = this.state.turn!;
    return cmd('RollDice', null, { actor: player(by ?? turn.playerId), target: { kind: 'turn', id: turn.turnId } });
  }
  endTurnCmd(by?: string): GameCommand {
    const turn = this.state.turn!;
    return cmd('EndTurn', null, { actor: player(by ?? turn.playerId), target: { kind: 'turn', id: turn.turnId } });
  }
  /** Timeout for the single pending deadline. */
  timeoutCmd(): GameCommand {
    const [d] = pendingDeadlines(this.state);
    return cmd('Timeout', null, { target: d!.target });
  }
  /** The single pending deadline time. */
  get deadline(): number {
    return pendingDeadlines(this.state)[0]!.at;
  }

  // ---- Accepted shortcuts ----

  rollForOrder(value: number, at?: number): readonly GameEvent[] {
    return this.ok(this.rollForOrderCmd(this.state.setup!.playerId), { dice: [value], at });
  }
  roll(d1: number, d2: number, at?: number): readonly GameEvent[] {
    return this.ok(this.rollDiceCmd(), { dice: [d1, d2], at });
  }
  /** Legacy turn tests explicitly buy a pending asset before testing closure. */
  endTurn(at?: number): readonly GameEvent[] {
    if (this.state.purchase !== null) this.ok(cmd('BuyAsset', null, { actor: player(this.state.turn!.playerId), target: { kind: 'turn', id: this.state.turn!.turnId } }));
    return this.ok(this.endTurnCmd(), { at });
  }
  /** Timeout at the deadline (or `at`), forcing an automatic roll to `dice` when given. */
  timeout(opts: { at?: number | undefined; dice?: readonly number[] | undefined } = {}): readonly GameEvent[] {
    return this.ok(this.timeoutCmd(), { at: opts.at ?? this.deadline, dice: opts.dice });
  }
}

/** CreateGame, AddPlayer for each id, StartGame: a game in phase `setup`. */
export function setupGame(ids: readonly string[], seed = 42): Game {
  const g = new Game();
  g.ok(cmd('CreateGame', { seed, rulesVersion: 'core-5' }, { rev: 0 }));
  for (const id of ids) g.ok(cmd('AddPlayer', { playerId: id }, { rev: g.state.revision }));
  g.ok(cmd('StartGame', null, { rev: g.state.revision }));
  return g;
}

/** A game in phase `playing` whose turn order is the join order (forced descending order rolls). */
export function playingGame(ids: readonly string[], seed = 42): Game {
  const g = setupGame(ids, seed);
  ids.forEach((_id, i) => g.rollForOrder(6 - i));
  if (g.state.phase !== 'playing') throw new Error('expected phase playing');
  return g;
}

export const types = (events: readonly GameEvent[]) => events.map((e) => e.type);
