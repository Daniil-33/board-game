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
  PHASE_NOT_ALLOWED: 'Houses can be built and sold only during play.',
  AUCTION_IN_PROGRESS: 'Not while an auction is running.',
  NOT_ACTIVE_PLAYER: 'Only on your turn.',
  DECISION_PENDING: 'Decide on the purchase first.',
  RENT_PENDING: 'Pay the rent first.',
  NOT_A_BUILDABLE_ASSET: 'Houses can be built only on monopoly assets.',
  NOT_OWNER: 'You do not own this asset.',
  GROUP_INCOMPLETE: 'You need the whole group to build.',
  GROUP_MORTGAGED: 'An asset of this group is mortgaged.',
  MAX_HOUSES: 'This asset already has 4 houses.',
  UNEVEN_BUILD: 'Build evenly: another asset of the group has fewer houses.',
  BUILD_QUOTA_USED: 'You have already built a house this turn.',
  INSUFFICIENT_FUNDS: 'Not enough money to build.',
  NO_HOUSES: 'There is no house to sell.',
  UNEVEN_SALE: 'Sell evenly: another asset of the group has more houses.',
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
