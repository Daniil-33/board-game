import type { DebtEvent } from './debt.js';
import type { MortgageEvent } from './mortgage.js';
import { rentQuotes, type RentQuote, type RentEvent } from './rent.js';
import type { HouseEvent } from './houses.js';
import type { PlayerId } from './types.js';
import type { GameState } from './state.js';
import type { GameEvent } from './engine.js';
import type { LifecycleEvent } from './lifecycle.js';
import type { SetupEvent } from './setup.js';
import type { ResignationEvent } from './resignation.js';
import type { TurnEvent } from './turns.js';

/**
 * Who a projection is for. The host (Room) uses the raw state; projection is
 * only for clients. A player viewer who is not a game member is treated as a
 * spectator.
 */
export type Viewer =
  | { readonly kind: 'player'; readonly id: PlayerId }
  | { readonly kind: 'spectator' };

export type Visibility = 'public' | 'secret';

/**
 * Visibility of every GameState field. `satisfies Record<keyof GameState, ...>`
 * makes adding a state field without classifying it a compile error.
 */
export const STATE_VISIBILITY = {
  mortgages: 'public', eliminations: 'public', finishedAt: 'public',
  houses: 'public', rent: 'public', owners: 'public', purchase: 'public', auction: 'public',
  board: 'public', economy: 'public', balances: 'public',
  revision: 'public',
  rulesVersion: 'public',
  phase: 'public',
  players: 'public',
  rng: 'secret',
  setup: 'public',
  order: 'public',
  turn: 'public',
  positions: 'public',
  jail: 'public',
  eliminated: 'public',
  winner: 'public',
} as const satisfies Record<keyof GameState, Visibility>;

type PublicStateKey = {
  [K in keyof GameState]: (typeof STATE_VISIBILITY)[K] extends 'public' ? K : never;
}[keyof GameState];

/** What a client may see of the game state. */
export type StateView = { readonly [K in Exclude<PublicStateKey, 'mortgages'>]: GameState[K] } & { readonly rentQuotes: Readonly<Record<string, RentQuote>>;
  readonly mortgages: Readonly<Record<string, import('./state.js').Mortgage & {readonly remainingLaps: number}>>;
  readonly result: {readonly winner: PlayerId; readonly finishedAt: import('./types.js').Timestamp; readonly eliminations: GameState['eliminations']; readonly finalBalances: GameState['balances']} | null;
};

const PUBLIC_STATE_KEYS = (Object.keys(STATE_VISIBILITY) as (keyof GameState)[]).filter(
  (k) => STATE_VISIBILITY[k] === 'public',
) as PublicStateKey[];

function normalizeViewer(state: GameState, viewer: Viewer): Viewer {
  if (viewer.kind === 'player' && !state.players.some((p) => p.id === viewer.id)) {
    return { kind: 'spectator' };
  }
  return viewer;
}

/** Plain, detached deep copy of JSON-compatible data. */
function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Build the view of `state` for `viewer`. Copies only the keys classified as
 * public, so a new field can never leak by default. Pure; `state` is untouched.
 */
export function projectState(state: GameState, viewer: Viewer): StateView {
  // Every viewer currently sees the same public view; normalizing keeps
  // non-members on the spectator path once views start to differ.
  normalizeViewer(state, viewer);
  const view: Partial<Record<PublicStateKey, unknown>> = {};
  for (const key of PUBLIC_STATE_KEYS) {
    view[key] = copy(state[key]);
  }
  return { ...view, rentQuotes: rentQuotes(state),
    mortgages: Object.fromEntries(Object.entries(state.mortgages).map(([id, term]) => [id, {...copy(term), remainingLaps: 8 - term.lapsCompleted}])),
    result: state.phase === 'finished' ? copy({winner: state.winner!, finishedAt: state.finishedAt!, eliminations: state.eliminations, finalBalances: state.balances}) : null,
  } as StateView;
}

// ---- Events -----------------------------------------------------------------

/**
 * Visibility of every event type the engine can emit. Adding an event type to
 * `CoreEvent` without classifying it here is a compile error; an event
 * type missing at runtime fails closed in `projectEvents`.
 */
export const EVENT_VISIBILITY = {
  LiquidationApplied: 'public', PlayerBankrupt: 'public',
  AssetMortgaged: 'public', AssetRedeemed: 'public', MortgageExpired: 'public', AssetsReleased: 'public',
  RentDue: 'public', RentPaid: 'public', HouseBuilt: 'public', HouseSold: 'public',
  PurchaseOffered: 'public', AssetPurchased: 'public', AuctionStarted: 'public',
  AuctionBid: 'public', AuctionPassed: 'public', AuctionWon: 'public', AuctionEndedUnsold: 'public',
  TurnPaused: 'public', TurnResumed: 'public',
  BoardGenerated: 'public', BalanceChanged: 'public',
  GameCreated: 'public',
  PlayerAdded: 'public',
  PlayerLeftLobby: 'public',
  PlayerResigned: 'public',
  GameEnded: 'public',
  GameStarted: 'public',
  OrderRollStarted: 'public',
  OrderDieRolled: 'public',
  OrderTied: 'public',
  TurnOrderDetermined: 'public',
  TurnStarted: 'public',
  DiceRolled: 'public',
  PlayerMoved: 'public',
  TurnContinued: 'public',
  TurnEnded: 'public',
  SentToJail: 'public',
  InterimJailAttemptFailed: 'public',
  InterimJailReleased: 'public',
} as const satisfies Record<CoreEvent['type'], Visibility>;

/** Every event type this rules version emits. */
export type CoreEvent = DebtEvent | LifecycleEvent | SetupEvent | TurnEvent | ResignationEvent | RentEvent | HouseEvent | MortgageEvent;

/** An event reached projection without a visibility classification: an engine defect. */
export class UnclassifiedEventError extends Error {
  readonly eventType: string;

  constructor(eventType: string) {
    super(`Event type "${eventType}" has no visibility classification`);
    this.name = 'UnclassifiedEventError';
    this.eventType = eventType;
  }
}

/**
 * Events `viewer` may see, in their original order, as detached copies.
 * Throws `UnclassifiedEventError` (and returns nothing) on any unclassified type.
 */
export function projectEvents(events: readonly GameEvent[], viewer: Viewer): GameEvent[] {
  void viewer; // every current event is public to every viewer
  const out: GameEvent[] = [];
  for (const event of events) {
    const visibility: Visibility | undefined = Object.hasOwn(EVENT_VISIBILITY, event.type)
      ? EVENT_VISIBILITY[event.type as keyof typeof EVENT_VISIBILITY]
      : undefined;
    if (visibility === undefined) throw new UnclassifiedEventError(event.type);
    if (visibility === 'public') out.push(copy(event));
  }
  return out;
}
