<script setup lang="ts">
import { Translation as I18nT } from 'vue-i18n';
import { i18n, t } from '../../shared/i18n/index';
import { houseReason, mortgageReason, type HudMessage } from '../../entities/game/index';

defineProps<{ fatal: string | null; connected: boolean; problem: string | null; messages: readonly HudMessage[] }>();
const emit = defineEmits<{ dismiss: [id: number] }>();
const reasonFor = (message: HudMessage): string | null => houseReason(message.code, message.commandType) ?? mortgageReason(message.code, message.commandType);
</script>

<template>
  <p v-if="fatal" class="error" data-testid="fatal">{{ fatal }}</p>
  <p v-else-if="!connected" class="warn-box" role="status" data-testid="offline">{{ t('hud.connection_lost_reconnecting') }}</p>
  <p v-if="problem" class="warn-box" data-testid="problem">{{ problem }}</p>
  <ul v-if="messages.length > 0" class="messages">
    <li v-for="message in messages" :key="message.id" class="error" data-testid="message" :data-code="message.code">
      <i18n-t tag="span" :i18n="i18n.global" :keypath="reasonFor(message) ? 'hud.rejected_command' : 'common.server_message'">
        <template #code><strong>{{ message.code }}</strong></template>
        <template #message>{{ message.message }}</template>
        <template #reason>{{ reasonFor(message) }}</template>
      </i18n-t>
      <button data-testid="message-dismiss" class="link" :aria-label="t('common.dismiss')" @click="emit('dismiss', message.id)">{{ t('common.dismiss_icon') }}</button>
    </li>
  </ul>
</template>
