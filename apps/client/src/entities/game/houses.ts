import { t } from '../../shared/i18n/index';
/**
 * Build and Sell controls of the asset card. Legality, cost and refund come
 * only from game-core's pure helpers; this module adds the connection checks
 * and the reason texts, and never decides a game outcome itself.
 */
import { buildLegality, houseCost, houseRefund, saleLegality } from '@game/game-core';
import type { AssetId, GameState, HouseErrorCode, Money, StateView } from '@game/game-core';
import type { ClientCommandType } from '@game/protocol';
import { connectionReason, type ActionContext } from './view';

/** One message per game-core house error code, for disabled controls and rejected Acks. */
export const HOUSE_REASONS: Readonly<Record<HouseErrorCode, string>> = {
  get PHASE_NOT_ALLOWED() { return t('reasons.house.PHASE_NOT_ALLOWED'); },
  get AUCTION_IN_PROGRESS() { return t('reasons.house.AUCTION_IN_PROGRESS'); },
  get NOT_ACTIVE_PLAYER() { return t('reasons.house.NOT_ACTIVE_PLAYER'); },
  get DECISION_PENDING() { return t('reasons.house.DECISION_PENDING'); },
  get RENT_PENDING() { return t('reasons.house.RENT_PENDING'); },
  get NOT_A_BUILDABLE_ASSET() { return t('reasons.house.NOT_A_BUILDABLE_ASSET'); },
  get NOT_OWNER() { return t('reasons.house.NOT_OWNER'); },
  get GROUP_INCOMPLETE() { return t('reasons.house.GROUP_INCOMPLETE'); },
  get GROUP_MORTGAGED() { return t('reasons.house.GROUP_MORTGAGED'); },
  get MAX_HOUSES() { return t('reasons.house.MAX_HOUSES'); },
  get UNEVEN_BUILD() { return t('reasons.house.UNEVEN_BUILD'); },
  get BUILD_QUOTA_USED() { return t('reasons.house.BUILD_QUOTA_USED'); },
  get INSUFFICIENT_FUNDS() { return t('reasons.house.INSUFFICIENT_FUNDS'); },
  get NO_HOUSES() { return t('reasons.house.NO_HOUSES'); },
  get UNEVEN_SALE() { return t('reasons.house.UNEVEN_SALE'); },
};

/**
 * The reason text for a rejected BuildHouse or SellHouse with a house error
 * code. Other commands share some codes (INSUFFICIENT_FUNDS, NOT_ACTIVE_PLAYER,
 * ...) and get no house text.
 */
export function houseReason(code: string, commandType: ClientCommandType | undefined): string | null {
  if (commandType !== 'BuildHouse' && commandType !== 'SellHouse') return null;
  return Object.hasOwn(HOUSE_REASONS, code) ? HOUSE_REASONS[code as HouseErrorCode] : null;
}

/**
 * The view as the legality helpers' input. `StateView` holds every
 * `GameState` field except the secret `rng`, which no legality helper reads;
 * the assignment below fails to compile if the view ever lacks another field.
 * A parity test checks the helpers give the same codes on a core state and on
 * its projection.
 */
export function legalityInput(view: StateView): GameState {
  const withoutRng: Omit<GameState, 'rng'> = view;
  return withoutRng as GameState;
}

export interface HouseControl {
  readonly enabled: boolean;
  /** The game-core code that forbids the action, if any. */
  readonly code: HouseErrorCode | null;
  /** Why the control is disabled; null when enabled. */
  readonly reason: string | null;
}

export interface HouseControls {
  readonly build: HouseControl & { readonly cost: Money };
  readonly sell: HouseControl & { readonly refund: Money };
}

function control(ctx: ActionContext, type: 'BuildHouse' | 'SellHouse', code: HouseErrorCode | null): HouseControl {
  if (code !== null) return { enabled: false, code, reason: HOUSE_REASONS[code] };
  const reason = connectionReason(ctx, type);
  return { enabled: reason === null, code: null, reason };
}

/**
 * Controls for `assetId`, or null when the card shows none: the asset is not
 * a monopoly asset or the viewer does not own it.
 */
export function houseControls(ctx: ActionContext, assetId: AssetId): HouseControls | null {
  const { view, me } = ctx;
  if (view === null || me === null) return null;
  const asset = view.board?.cells.find((c) => c.kind === 'monopoly' && c.asset?.assetId === assetId)?.asset;
  if (asset === undefined || asset === null || view.owners[assetId] !== me) return null;
  const state = legalityInput(view);
  const cost = houseCost(asset.price);
  return {
    build: { ...control(ctx, 'BuildHouse', buildLegality(state, me, assetId)), cost },
    sell: { ...control(ctx, 'SellHouse', saleLegality(state, me, assetId)), refund: houseRefund(cost) },
  };
}
