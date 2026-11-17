/**
 * Mortgage and Redeem controls of the asset card. Legality and the advance
 * come only from game-core's pure helpers and the projected mortgage terms;
 * this module adds the connection checks and the reason texts, and never
 * decides a game outcome itself.
 */
import { mortgageAdvance, mortgageLegality, redeemLegality } from '@game/game-core';
import type { AssetId, Money, MortgageErrorCode, PlayerId, StateView } from '@game/game-core';
import type { ClientCommandType } from '@game/protocol';
import { legalityInput } from './houses';
import { connectionReason, type ActionContext, type MortgageCommandType } from './view';

/** One message per game-core mortgage error code, for disabled controls and rejected Acks. */
export const MORTGAGE_REASONS: Readonly<Record<MortgageErrorCode, string>> = {
  PHASE_NOT_ALLOWED: 'Assets can be mortgaged and redeemed only during play.',
  AUCTION_IN_PROGRESS: 'Not while an auction is running.',
  NOT_ACTIVE_PLAYER: 'Only on your turn.',
  DECISION_PENDING: 'Decide on the purchase first.',
  RENT_PENDING: 'Pay the rent first.',
  NOT_AN_ASSET: 'This cell is not an asset.',
  NOT_OWNER: 'You do not own this asset.',
  ALREADY_MORTGAGED: 'This asset is already mortgaged.',
  HAS_HOUSES: 'Sell the houses on this asset first.',
  NOT_MORTGAGED: 'This asset is not mortgaged.',
  INSUFFICIENT_FUNDS: 'Not enough money to redeem.',
};

/**
 * The reason text for a rejected Mortgage or Redeem with a mortgage error
 * code. Other commands share some codes and get no mortgage text.
 */
export function mortgageReason(code: string, commandType: ClientCommandType | undefined): string | null {
  if (commandType !== 'Mortgage' && commandType !== 'Redeem') return null;
  return Object.hasOwn(MORTGAGE_REASONS, code) ? MORTGAGE_REASONS[code as MortgageErrorCode] : null;
}

export interface MortgageControl {
  readonly enabled: boolean;
  /** The game-core code that forbids the action, if any. */
  readonly code: MortgageErrorCode | null;
  /** Why the control is disabled; null when enabled. */
  readonly reason: string | null;
}

export interface MortgageControls {
  /** Labelled with `mortgageAdvance(price)`, the amount a mortgage pays out. */
  readonly mortgage: MortgageControl & { readonly advance: Money };
  /** Labelled with the stored advance of the current mortgage, or the helper advance when there is none. */
  readonly redeem: MortgageControl & { readonly amount: Money };
}

function control(ctx: ActionContext, type: MortgageCommandType, code: MortgageErrorCode | null): MortgageControl {
  if (code !== null) return { enabled: false, code, reason: MORTGAGE_REASONS[code] };
  const reason = connectionReason(ctx, type);
  return { enabled: reason === null, code: null, reason };
}

/**
 * Controls for `assetId`, or null when the card shows none: the cell is not
 * an asset or the viewer does not own it.
 */
export function mortgageControls(ctx: ActionContext, assetId: AssetId): MortgageControls | null {
  const { view, me } = ctx;
  if (view === null || me === null) return null;
  const asset = view.board?.cells.find((c) => c.asset?.assetId === assetId)?.asset;
  if (asset === undefined || asset === null || view.owners[assetId] !== me) return null;
  const state = legalityInput(view);
  const advance = mortgageAdvance(asset.price);
  const stored = Object.hasOwn(view.mortgages, assetId) ? view.mortgages[assetId]!.advance : advance;
  return {
    mortgage: { ...control(ctx, 'Mortgage', mortgageLegality(state, me, assetId)), advance },
    redeem: { ...control(ctx, 'Redeem', redeemLegality(state, me, assetId)), amount: stored },
  };
}

export interface MortgageTerms {
  readonly advance: Money;
  readonly remainingLaps: number;
  /** Players who still have to finish a turn before the current lap of the term counts. */
  readonly pending: readonly PlayerId[];
}

/** The projected terms of a mortgaged asset, or null; nothing is counted locally. */
export function mortgageTerms(view: StateView | null | undefined, assetId: AssetId | undefined): MortgageTerms | null {
  if (!view || assetId === undefined || !Object.hasOwn(view.mortgages, assetId)) return null;
  const term = view.mortgages[assetId]!;
  return { advance: term.advance, remainingLaps: term.remainingLaps, pending: term.pending };
}
