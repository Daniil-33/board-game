export type {
  Money,
  PlayerId,
  AssetId,
  CommandId,
  Revision,
  Timestamp,
  Entropy,
} from './types.js';
export { timestamp, entropy } from './types.js';

export type { TransitionContext } from './context.js';

export type {
  Actor,
  ActorKind,
  GameCommand,
  Expectation,
  TargetRef,
  GameEvent,
  EngineError,
  AcceptedResult,
  RejectedResult,
  TransitionResult,
  Transition,
  GameEngine,
} from './engine.js';

export { Q } from './money.js';

export type { RngState } from './rng.js';
export { RNG_ALGORITHM, absorbEntropy, seedRng, isValidSeed, isWellFormedRng, nextUint32, nextIntInclusive } from './rng.js';

export type { PurchaseDecision, AuctionState, GameState, Phase, PlayerState, SetupState, TurnState, TurnQuotas, JailEntry } from './state.js';
export { genesis, MIN_PLAYERS, MAX_PLAYERS } from './state.js';

export type { InvariantName } from './invariants.js';
export { checkInvariants, InvariantViolationError } from './invariants.js';

export type { CommandSpec, CommandRegistry, HandlerResult, EnvelopeErrorCode, ConcurrencyGuard } from './registry.js';
export { createEngine, ok, fail, revisionGuard, targetGuard, targetsGuard } from './registry.js';

export type {
  LifecycleErrorCode,
  CreateGamePayload,
  AddPlayerPayload,
  CreateGameCommand,
  AddPlayerCommand,
  LeaveLobbyPayload,
  LeaveLobbyCommand,
  PlayerLeftLobbyEvent,
  StartGameCommand,
  LifecycleCommand,
  GameCreatedEvent,
  PlayerAddedEvent,
  GameStartedEvent,
  LifecycleEvent,
} from './lifecycle.js';
export { CURRENT_RULES_VERSION, SUPPORTED_RULES_VERSIONS, lifecycleCommands } from './lifecycle.js';

export type { GeneratedBoard, BoardCell, BoardAsset, BoardGenerated, BoardGeneratedEvent, CellKind, LayoutCell, PlayerMovedEvent } from './board.js';
export { CLASSIC_40 } from './board.js';

export type { PendingDeadline } from './deadlines.js';
export {
  pendingDeadlines,
  SETUP_ROLL_DURATION_MS,
  TURN_DURATION_MS,
  CONTINUATION_MS,
  AUCTION_RESPONSE_MS,
  AUCTION_RESPONSE_TARGET_KIND,
  TURN_TARGET_KIND,
  SETUP_ROLL_TARGET_KIND,
} from './deadlines.js';

export type {
  RollForOrderCommand,
  OrderRollStartedEvent,
  OrderDieRolledEvent,
  OrderTiedEvent,
  TurnOrderDeterminedEvent,
  SetupEvent,
} from './setup.js';
export { setupCommands } from './setup.js';

export type {
  RollDiceCommand,
  EndTurnCommand,
  TimeoutCommand,
  TurnEndReason,
  TurnStartedEvent,
  DiceRolledEvent,
  TurnContinuedEvent,
  TurnEndedEvent,
  SentToJailEvent,
  TurnEvent,
  TurnErrorCode,
} from './turns.js';
export { TURN_QUOTAS, turnCommands } from './turns.js';

export type { InterimJailAttemptFailedEvent, InterimJailReleasedEvent, InterimJailEvent } from './interim-jail.js';
export { INTERIM_JAIL_RULE } from './interim-jail.js';

export { gameCommands, gameEngine } from './rules.js';

export { isPlainData, canonicalJson } from './canonical.js';

export type { Viewer, Visibility, StateView, CoreEvent } from './projection.js';
export {
  STATE_VISIBILITY,
  EVENT_VISIBILITY,
  projectState,
  projectEvents,
  UnclassifiedEventError,
} from './projection.js';

export type { LogEntry, Session, SessionErrorCode } from './session.js';
export { createSession, replay, restoreSession, ReplayDivergenceError } from './session.js';

/** Voluntary elimination and last-active-player victory contracts. */
export type { ResignCommand, ResignationErrorCode, PlayerResignedEvent, GameEndedEvent, ResignationEvent } from './resignation.js';

export { startingCapital, lapReward, creditBalance } from './money.js';
export type { BalanceChanged, BalanceChangedEvent } from './money.js';
export { PRICE_TABLE } from './board/prices.js';
export { generateBoard } from './board/generate.js';

/** Public acquisition contracts; bid amounts and reservation derive from auction state. */
export { nextBidAmount } from './purchase-auction.js';
export type { BuyAssetCommand, StartAuctionCommand, BidCommand, PassAuctionCommand, PurchaseOfferedEvent, AssetPurchasedEvent, AuctionStartedEvent, AuctionBidEvent, AuctionPassedEvent, AuctionWonEvent, AuctionEndedUnsoldEvent, TurnPausedEvent, TurnResumedEvent, PurchaseAuctionEvent } from './purchase-auction.js';
export { debitBalance } from './money.js';

export type { RentSettlement } from './state.js';
export { rentFor, rentQuotes, energyRentFor, isMortgaged } from './rent.js';
export type { RentQuote, RentEvent, RentDue, RentPaid, PayRentCommand } from './rent.js';
export { buildLegality, saleLegality, houseCost, houseRefund } from './houses.js';
export type { HouseErrorCode, HouseEvent, HouseBuilt, HouseSold, BuildHouseCommand, SellHouseCommand } from './houses.js';

export { mortgageAdvance, mortgageLegality, redeemLegality } from './mortgage.js';
export type { MortgageCommand, RedeemCommand, MortgageErrorCode, AssetMortgaged, AssetRedeemed, MortgageExpired, MortgageEvent } from './mortgage.js';
export type { Mortgage, Elimination } from './state.js';
export type { AssetsReleased } from './resignation.js';
