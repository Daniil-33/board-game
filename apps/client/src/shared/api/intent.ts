import { AUCTION_RESPONSE_TARGET_KIND, SETUP_ROLL_TARGET_KIND, TURN_TARGET_KIND } from '@game/game-core';
import type { AssetId, Expectation, StateView } from '@game/game-core';
import type { ClientCommandType } from '@game/protocol';

/**
 * Per-asset commands, all with an `{ assetId }` payload: house controls come
 * from `houseControls` in game/houses.ts, mortgage controls from
 * `mortgageControls` in game/mortgages.ts.
 */
export type AssetCommandType = 'BuildHouse' | 'SellHouse' | MortgageCommandType;
/** The protocol's mortgage commands. */
export type MortgageCommandType = Extract<ClientCommandType, 'Mortgage' | 'Redeem'>;
/**
 * The payload the protocol defines for a command type: `{ assetId }` for the
 * house and mortgage commands, `null` otherwise. `createConnection` builds the frame as a
 * `CommandFrame`, so the compiler checks this against the protocol schema.
 */
export type CommandPayload<T extends ClientCommandType> = T extends AssetCommandType
  ? { readonly assetId: AssetId }
  : T extends 'PlaceCasinoBet' ? { readonly amount: number } : null;
/** A command type whose payload is `null`. */
export type NullPayloadType = { [T in ClientCommandType]: CommandPayload<T> extends null ? T : never }[ClientCommandType];
/** One intent: a command type with the payload the protocol defines for it. */
export type Intent = { [T in ClientCommandType]: { readonly type: T; readonly payload: CommandPayload<T> } }[ClientCommandType];
/** What a component asks to send: a null-payload type by name, or a full intent. */
export type IntentRequest = NullPayloadType | Intent;

/** The target a command of `type` must name, read from the view; null when the view has none. */
export function commandExpectation(view: StateView | null, type: ClientCommandType): Expectation | null {
  if (view === null || type === 'Resign') return null;
  if (type === 'RollForOrder') {
    if (view.phase !== 'setup' || view.setup === null) return null;
    return { kind: 'target', target: { kind: SETUP_ROLL_TARGET_KIND, id: view.setup.setupRollId } };
  }
  if (type === 'Bid' || type === 'PassAuction') {
    return view.auction === null ? null : { kind: 'target', target: { kind: AUCTION_RESPONSE_TARGET_KIND, id: view.auction.responseId } };
  }
  if (view.phase !== 'playing' || view.turn === null) return null;
  return { kind: 'target', target: { kind: TURN_TARGET_KIND, id: view.turn.turnId } };
}
