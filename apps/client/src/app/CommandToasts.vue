<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useClient } from '../features/client-session/index';
import { houseReason, mortgageReason, type HudMessage } from '../entities/game/index';
import { Toast } from '../shared/ui/index';
import { t } from '../shared/i18n/index';

const client = useClient();
const droppedThrough = ref(0);
const messages = computed(() => client.game.messages.filter(message =>
  message.commandType !== undefined && message.id > droppedThrough.value,
));
watch(messages, current => {
  const dropped = current.at(-4);
  if (dropped) droppedThrough.value = dropped.id;
}, { immediate: true });

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

function translated(message: HudMessage): string {
  const { code, commandType } = message;
  const reason = houseReason(code, commandType) ?? mortgageReason(code, commandType) ?? otherReason(code);
  return reason
    ? t('hud.rejected_command', { code, message: message.message, reason })
    : t('game_layout.command_rejected', { code, message: message.message });
}
</script>

<template>
  <Toast v-for="message in messages" :key="message.id" :open="true" :message="translated(message)"
    data-testid="message" dismiss-test-id="message-dismiss" :data-code="message.code"
    @update:open="client.connection.dismissMessage(message.id)" />
</template>
