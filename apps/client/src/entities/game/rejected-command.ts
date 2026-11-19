import type { ClientCommandType } from '@game/protocol';
import { houseReason } from './houses';
import { mortgageReason } from './mortgages';
import type { HudMessage } from '../../shared/api/index';
import { t } from '../../shared/i18n/index';

function commandTitle(commandType: ClientCommandType): string {
  switch (commandType) {
    case 'RollForOrder': return t('command_title.roll_for_order');
    case 'RollDice': return t('command_title.roll_dice');
    case 'EndTurn': return t('command_title.end_turn');
    case 'Resign': return t('command_title.resign');
    case 'BuyAsset': return t('command_title.buy_asset');
    case 'StartAuction': return t('command_title.start_auction');
    case 'Bid': return t('command_title.bid');
    case 'PassAuction': return t('command_title.pass_auction');
    case 'PayRent': return t('command_title.pay_rent');
    case 'BuildHouse': return t('command_title.build_house');
    case 'SellHouse': return t('command_title.sell_house');
    case 'Mortgage': return t('command_title.mortgage');
    case 'Redeem': return t('command_title.redeem');
  }
}

function otherReason(code: string): string | null {
  switch (code) {
    case 'REVISION_MISMATCH':
    case 'TARGET_MISMATCH': return t('command_reason.stale');
    case 'ACTOR_NOT_ALLOWED':
    case 'UNKNOWN_ACTOR':
    case 'PLAYER_ELIMINATED': return t('view.inactive_player');
    case 'PHASE_NOT_ALLOWED': return t('game_layout.action_unavailable');
    case 'DEADLINE_PASSED': return t('view.deadline_passed');
    case 'DEADLINE_NOT_REACHED': return t('command_reason.deadline_not_reached');
    case 'ALREADY_ROLLED': return t('command_reason.already_rolled');
    case 'ROLL_REQUIRED': return t('command_reason.roll_required');
    case 'NOT_ACTIVE_PLAYER': return t('command_reason.not_active');
    case 'NO_PURCHASE': return t('command_reason.no_purchase');
    case 'NO_RENT': return t('command_reason.no_rent');
    case 'AUCTION_IN_PROGRESS': return t('command_reason.auction');
    case 'INSUFFICIENT_FUNDS': return t('command_reason.insufficient_funds');
    case 'ROOM_UNAVAILABLE': return t('chat.room_unavailable');
    case 'PERSISTENCE_FAILED': return t('command_reason.persistence_failed');
    case 'INVALID_PAYLOAD':
    case 'COMMAND_ID_CONFLICT':
    case 'UNKNOWN_COMMAND': return t('command_reason.invalid');
    default: return null;
  }
}

export interface RejectedCommandCopy {
  readonly title: string;
  readonly reason: string;
}

/** Visible rejection copy is client-owned; protocol codes and server messages stay diagnostic only. */
export function rejectedCommandCopy(message: HudMessage): RejectedCommandCopy {
  const title = message.commandType
    ? commandTitle(message.commandType)
    : t('command_title.generic');
  const reason = (message.commandType
    ? houseReason(message.code, message.commandType)
      ?? mortgageReason(message.code, message.commandType)
      : null)
    ?? otherReason(message.code);
  return { title, reason: reason ?? t('command_reason.try_again') };
}

export function rejectedCommandText(message: HudMessage): string {
  const copy = rejectedCommandCopy(message);
  return t('command_reason.with_title', { title: copy.title, reason: copy.reason });
}
