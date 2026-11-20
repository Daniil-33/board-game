import type { GameEvent } from '@game/game-core';
import { t } from '../../shared/i18n/index';
import { formatMoney } from '../../shared/lib/index';

export function describeEvent(event: GameEvent, nameOf: (id: string) => string, assetOf: (id: string) => string) {
  const payload = event.payload && typeof event.payload === 'object' ? event.payload as Record<string, unknown> : {};
  const name = (field: string) => typeof payload[field] === 'string' ? nameOf(payload[field]) : '';
  const money = (field: string) => typeof payload[field] === 'number' ? formatMoney(payload[field]) : '';
  const player = name('playerId');
  const asset = typeof payload.assetId === 'string' ? assetOf(payload.assetId) : '';
  switch (event.type) {
    case 'DiceRolled': return { icon: '⚄', text: t('journal.dice', { player, dice: Array.isArray(payload.dice) ? payload.dice.filter(Number.isInteger).join(' + ') : '' }) };
    case 'OrderDieRolled': return { icon: '⚄', text: t('journal.order_die', { player, die: Number.isInteger(payload.value) ? payload.value : '' }) };
    case 'TurnStarted': return { icon: '▶', text: t('journal.turn', { player }) };
    case 'PlayerMoved': return { icon: '→', text: t('journal.move', { player, cell: Number.isInteger(payload.to) ? payload.to : '' }) };
    case 'BalanceChanged': return { icon: '◈', text: t('journal.balance', { player, amount: money('delta'), balance: money('balance') }) };
    case 'PurchaseOffered': return { icon: '◇', text: t('journal.offer', { player, asset }) };
    case 'AssetPurchased': return { icon: '◇', text: t('journal.purchase', { player, asset, amount: money('price') }) };
    case 'AuctionStarted': return { icon: '◇', text: t('journal.auction', { asset }) };
    case 'AuctionBid': return { icon: '◇', text: t('journal.bid', { player, amount: money('amount') }) };
    case 'AuctionWon': return { icon: '◇', text: t('journal.auction_won', { player, asset, amount: money('amount') }) };
    case 'RentDue': return { icon: '◈', text: t('journal.rent_due', { payer: name('payerId'), owner: name('ownerId'), amount: money('amount') }) };
    case 'RentPaid': return { icon: '◈', text: t('journal.rent_paid', { payer: name('payerId'), owner: name('ownerId'), amount: money('amount') }) };
    case 'HouseBuilt': return { icon: '⌂', text: t('journal.build', { player, asset, amount: money('cost') }) };
    case 'HouseSold': return { icon: '⌂', text: t('journal.sell', { player, asset, amount: money('refund') }) };
    case 'AssetMortgaged': return { icon: '▣', text: t('journal.mortgage', { player, asset, amount: money('advance') }) };
    case 'AssetRedeemed': return { icon: '▣', text: t('journal.redeem', { player, asset, amount: money('amount') }) };
    case 'PlayerBankrupt': return { icon: '!', text: t('journal.bankrupt', { player, debt: money('debt') }) };
    case 'PlayerResigned': return { icon: '!', text: t('journal.resign', { player }) };
    case 'GameStarted': return { icon: '▶', text: t('journal.start') };
    case 'GameEnded': return { icon: '★', text: t('journal.end', { player: name('winner') }) };
    case 'GameCreated': return { icon: '◇', text: t('journal.created') };
    case 'BoardGenerated': return { icon: '▦', text: t('journal.board_generated') };
    case 'PlayerAdded': return { icon: '+', text: t('journal.join', { player }) };
    case 'PlayerLeftLobby': return { icon: '−', text: t('journal.leave', { player }) };
    case 'OrderRollStarted': return { icon: '⚄', text: t('journal.order_start') };
    case 'OrderTied': return { icon: '⚄', text: t('journal.order_tied') };
    case 'TurnOrderDetermined': return { icon: '⚄', text: t('journal.order_set') };
    case 'TurnPaused': return { icon: 'Ⅱ', text: t('turn_timer.paused') };
    case 'TurnResumed': return { icon: '▶', text: t('journal.resume') };
    case 'TurnContinued': return { icon: '▶', text: t('journal.continue') };
    case 'TurnEnded': return { icon: '■', text: t('journal.turn_end', { player }) };
    case 'SentToJail': return { icon: '▣', text: t('journal.jail', { player }) };
    case 'JailAttemptFailed': return { icon: '▣', text: t('journal.jail_failed', { player, attempts: payload.attemptsUsed }) };
    case 'JailReleased': return { icon: '→', text: t('journal.jail_release', { player, reason: payload.reason }) };
    case 'CasinoOffered': return { icon: '◇', text: t('journal.casino_offered', { player, cap: money('cap') }) };
    case 'CasinoResolved': return { icon: '◇', text: t('journal.casino_resolved', { player, amount: money('amount'), outcome: payload.won ? t('journal.won') : t('journal.lost') }) };
    case 'CasinoDeclined': return { icon: '◇', text: t('journal.casino_declined', { player }) };
    case 'ChanceDrawn': return { icon: '◇', text: t('journal.chance_drawn', { player, card: String(payload.card ?? ''), amount: money('amount') }) };
    case 'AuctionPassed': return { icon: '◇', text: t('journal.auction_pass', { player }) };
    case 'AuctionEndedUnsold': return { icon: '◇', text: t('journal.auction_unsold', { asset }) };
    case 'MortgageExpired': return { icon: '▣', text: t('journal.mortgage_expired', { asset }) };
    case 'AssetsReleased': return { icon: '▣', text: t('journal.assets_released', { player }) };
    case 'LiquidationApplied': return { icon: '!', text: t('journal.liquidation', { player: name('payerId'), amount: money('raised') }) };
    default: return null;
  }
}
