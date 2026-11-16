import type { AuctionState, GameState } from './state.js';

/**
 * E1(b): restore the latest surviving bid. E1(b1) provisionally allows a
 * passed bidder to lead/win again, without regaining a response slot.
 * The alternate reading is kept here for a focused policy test only.
 */
export function leaderAfterResignation(auction: AuctionState, state: GameState, passedMayLead = true): Pick<AuctionState, 'leader' | 'leadingBid'> {
  const eligibleBidder = (playerId: AuctionState['responder']) =>
    !state.eliminated.includes(playerId) && (passedMayLead || !auction.passed.includes(playerId));
  for (let i = auction.bids.length - 1; i >= 0; i--) {
    const bid = auction.bids[i]!;
    if (eligibleBidder(bid.playerId)) return { leader: bid.playerId, leadingBid: bid.amount };
  }
  return { leader: null, leadingBid: null };
}
