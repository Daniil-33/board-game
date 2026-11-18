import type { GameEvent } from '@game/game-core';
import type { SoundId } from '../../shared/sound/index';

export interface EventSound { id: SoundId; own: boolean }

export function soundForChat(authorId: string, viewerId: string | null): EventSound | null {
  return viewerId !== null && authorId !== viewerId ? { id: 'chat', own: false } : null;
}

export function createAuctionTickSoundMapper() {
  let lastTick = '';
  return (auctionId: string | null, responseId: string | null, remainingSeconds: number,
    responderId: string | null, viewerId: string | null): EventSound | null => {
    if (!Number.isInteger(remainingSeconds) || remainingSeconds < 1 || remainingSeconds > 3 || auctionId === null || responseId === null) return null;
    const key = `${auctionId}:${responseId}:${remainingSeconds}`;
    if (key === lastTick) return null;
    lastTick = key;
    return { id: 'auction-tick', own: viewerId !== null && responderId === viewerId };
  };
}

export function soundForTokenStep(playerId: string, viewerId: string | null, reducedMotion: boolean): EventSound | null {
  return reducedMotion ? null : { id: 'token-step', own: viewerId !== null && playerId === viewerId };
}

export function soundForEvent(event: GameEvent, viewerId: string | null): EventSound | null {
  const payload = event.payload && typeof event.payload === 'object' ? event.payload as Record<string, unknown> : {};
  const actor = typeof payload.playerId === 'string' ? payload.playerId : null;
  const own = viewerId !== null && actor === viewerId;
  switch (event.type) {
    case 'TurnStarted': return own ? { id: 'turn-start', own } : null;
    case 'TurnEnded': return payload.reason === 'timeout' && own ? { id: 'turn-timeout', own } : null;
    case 'DiceRolled': return { id: payload.double === true ? 'dice-double' : 'dice-roll', own };
    case 'AssetPurchased': return { id: 'purchase', own };
    case 'BalanceChanged': return typeof payload.delta === 'number' && payload.delta !== 0
      ? { id: payload.delta > 0 ? 'money-in' : 'money-out', own } : null;
    case 'AuctionBid': return { id: 'auction-bid', own };
    case 'AuctionWon': return { id: 'auction-win', own };
    case 'HouseBuilt': return { id: 'house-built', own };
    case 'AssetMortgaged': return { id: 'asset-mortgaged', own };
    case 'PlayerBankrupt': return { id: 'bankrupt', own };
    case 'GameEnded': {
      const winner = typeof payload.winner === 'string' ? payload.winner : null;
      return winner === null ? null : { id: 'victory', own: viewerId !== null && winner === viewerId };
    }
    default: return null;
  }
}
