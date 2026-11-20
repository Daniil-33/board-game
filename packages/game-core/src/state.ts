import type { GeneratedBoard } from './board/generate.js';
import type { AssetId, Money, PlayerId, Revision, Timestamp } from './types.js';
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

/** Remaining per-turn build and offer quotas; every turn, bonus included, starts full. */
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
  readonly pausedRemainingMs: number | null;
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

/** One prisoner's progress under the final jail rule. */
export interface JailEntry {
  readonly attemptsUsed: number;
}

export interface PurchaseDecision {
  readonly playerId: PlayerId;
  readonly cell: number;
  readonly assetId: AssetId;
}

export interface AuctionState {
  readonly auctionId: string;
  readonly assetId: AssetId;
  readonly cell: number;
  readonly price: Money;
  readonly startBid: Money;
  readonly step: Money;
  readonly reason: 'choice' | 'end-turn' | 'timeout';
  readonly order: readonly PlayerId[];
  readonly passed: readonly PlayerId[];
  readonly leader: PlayerId | null;
  readonly leadingBid: Money | null;
  readonly bids: readonly { readonly playerId: PlayerId; readonly amount: Money }[];
  readonly responder: PlayerId;
  readonly responseId: string;
  readonly responseDeadline: Timestamp;
}

export interface RentSettlement {
  readonly payerId: PlayerId;
  readonly ownerId: PlayerId;
  readonly assetId: AssetId;
  readonly cell: number;
  readonly kind: 'regular' | 'logistics' | 'energy';
  readonly amount: Money;
  readonly diceSum: number | null;
}

export interface BankCharge {
  readonly payerId: PlayerId;
  readonly amount: Money;
  readonly cause: 'chance';
}

export interface CasinoDecision {
  readonly playerId: PlayerId;
  readonly turnId: string;
  readonly cap: Money;
}

export interface Mortgage {
  readonly advance: Money;
  readonly lapsCompleted: number;
  readonly pending: readonly PlayerId[];
  /** Optional only for source compatibility with pre-core-8 test/client fixtures; persisted core-7 states pass through upgradeState. */
  readonly lockedTurnId?: string | null;
}

export interface Elimination {
  readonly playerId: PlayerId;
  readonly reason: 'resigned' | 'bankrupt';
  readonly at: Timestamp;
  readonly creditorId: PlayerId | null;
}

export interface GameState {
  readonly mortgages: Readonly<Record<string, Mortgage>>;
  readonly eliminations: readonly Elimination[];
  readonly finishedAt: Timestamp | null;
  readonly houses: Readonly<Record<string, number>>;
  readonly rent: RentSettlement | null;
  /** Optional only for source compatibility with pre-core-8 view fixtures; genesis and upgradeState always materialize null. */
  readonly charge?: BankCharge | null | undefined;
  readonly casino?: CasinoDecision | null | undefined;
  readonly owners: Readonly<Record<string, PlayerId>>;
  readonly purchase: PurchaseDecision | null;
  readonly auction: AuctionState | null;
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
  /** Players in jail, by player id. */
  readonly jail: Readonly<Record<string, JailEntry>>;
}

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;

/** The state every game starts from. */
export function genesis(): GameState {
  return {
    mortgages: {}, eliminations: [], finishedAt: null,
    owners: {}, purchase: null, auction: null, houses: {}, rent: null, charge: null, casino: null,
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
