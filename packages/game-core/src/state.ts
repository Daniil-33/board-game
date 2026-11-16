import type { GeneratedBoard } from './board/generate.js';
import type { Money, PlayerId, Revision, Timestamp } from './types.js';
import type { RngState } from './rng.js';

/**
 * Game phases known to this rules version.
 * `uninitialized` -> `lobby` (CreateGame) -> `setup` (StartGame) -> `playing`
 * (the order roll that fixes the turn order); setup/playing -> finished when
 * resignation leaves one active participant.
 */
export type Phase = 'uninitialized' | 'lobby' | 'setup' | 'playing' | 'finished';

export interface PlayerState {
  readonly id: PlayerId;
}

/** Order-roll state; present only in phase `setup`. */
export interface SetupState {
  /** Id of the current `setupRoll` target; never reused within a game. */
  readonly setupRollId: string;
  /** The current roller; always `round.pending[0]`. */
  readonly playerId: PlayerId;
  readonly deadline: Timestamp;
  /** Ordered groups, best first; a group of one is resolved. */
  readonly groups: readonly (readonly PlayerId[])[];
  /** The round rolling the first unresolved group. */
  readonly round: {
    readonly groupIndex: number;
    /** Members still to roll, in order. */
    readonly pending: readonly PlayerId[];
    /** Values rolled so far in this round, by player id. */
    readonly rolls: Readonly<Record<string, number>>;
  };
}

/** Remaining per-turn quotas. Nothing consumes them in stage 1. */
export interface TurnQuotas {
  readonly builds: number;
  readonly offers: number;
}

/** The current turn; present only in phase `playing`. */
export interface TurnState {
  /** Id of the current `turn` target; never reused within a game. */
  readonly turnId: string;
  readonly playerId: PlayerId;
  readonly deadline: Timestamp;
  /** Whether this turn was granted by a double. */
  readonly bonus: boolean;
  readonly rolled: boolean;
  /** Whether a Timeout before the roll extended this turn. */
  readonly continuation: boolean;
  /** Consecutive doubles of this player, carried into bonus turns. */
  readonly doublesStreak: number;
  /** A bonus turn starts for the same player when this turn closes. */
  readonly pendingBonus: boolean;
  readonly quotas: TurnQuotas;
}

/** One prisoner's progress under the interim jail rule. */
export interface JailEntry {
  readonly attemptsUsed: number;
}

export interface GameState {
  readonly board: GeneratedBoard | null;
  readonly economy: { readonly startingCapital: Money; readonly lapReward: Money } | null;
  readonly balances: Readonly<Record<string, Money>>;
  readonly revision: Revision;
  /** Rules version the game was created under; null before CreateGame. */
  readonly rulesVersion: string | null;
  readonly phase: Phase;
  /** Players in join order. */
  readonly players: readonly PlayerState[];
  /** Permanently eliminated participants, in resignation order. */
  readonly eliminated: readonly PlayerId[];
  /** Last active participant; non-null exactly in finished. */
  readonly winner: PlayerId | null;
  /** Seeded RNG state; null before CreateGame. */
  readonly rng: RngState | null;
  /** Order-roll state; non-null exactly in phase `setup`. */
  readonly setup: SetupState | null;
  /** Turn order; non-null exactly in phase `playing`. */
  readonly order: readonly PlayerId[] | null;
  /** Current turn; non-null exactly in phase `playing`. */
  readonly turn: TurnState | null;
  /** Ring cell of each active player; the winner’s final cell is retained. */
  readonly positions: Readonly<Record<string, number>>;
  /** Players in jail, by player id (interim jail rule). */
  readonly jail: Readonly<Record<string, JailEntry>>;
}

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;

/** The state every game starts from. */
export function genesis(): GameState {
  return {
    revision: 0 as Revision,
    board: null, economy: null, balances: {},
    rulesVersion: null,
    phase: 'uninitialized',
    players: [],
    eliminated: [],
    winner: null,
    rng: null,
    setup: null,
    order: null,
    turn: null,
    positions: {},
    jail: {},
  };
}
