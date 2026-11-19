<script setup lang="ts">
import { t } from '../../shared/i18n/index';
import { rejectedCommandText } from '../../entities/game/index';
import type { HudMessage } from '../../entities/game/index';

defineProps<{ fatal: string | null; connected: boolean; problem: string | null; messages: readonly HudMessage[] }>();
const emit = defineEmits<{ dismiss: [id: number] }>();
const copyFor = rejectedCommandText;
</script>

<template>
  <p v-if="fatal" class="error" data-testid="fatal">{{ fatal }}</p>
  <p v-else-if="!connected" class="warn-box" role="status" data-testid="offline">
    <span>{{ t('hud.connection_lost_reconnecting') }}</span>
    <br />
    <span>{{ t('hud.connection_lost_detail') }}</span>
  </p>
  <p v-if="problem" class="warn-box" data-testid="problem">{{ problem }}</p>
  <ul v-if="messages.length > 0" class="messages">
    <li v-for="message in messages" :key="message.id" class="error" data-testid="message" :data-code="message.code">
      <span>{{ copyFor(message) }}</span>
      <button data-testid="message-dismiss" class="link" :aria-label="t('common.dismiss')" @click="emit('dismiss', message.id)">{{ t('common.dismiss_icon') }}</button>
    </li>
  </ul>
</template>
