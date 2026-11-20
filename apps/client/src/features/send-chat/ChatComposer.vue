<script setup lang="ts">
import { computed, ref } from 'vue';
import { checkChatText } from '@game/protocol';
import type { ChatStore, OutgoingChatReason } from '../../entities/chat/index';
import { t } from '../../shared/i18n/index';
import { Button } from '../../shared/ui/index';
import { sendChat, type ChatTransport } from './send-chat';

const props = defineProps<{ chat: ChatStore; transport: ChatTransport; connected: boolean }>();
const text = ref('');
const checked = computed(() => checkChatText(text.value));
const rejection = computed(() => props.chat.state.outgoing.filter(entry => entry.status === 'rejected'));
function reason(code: OutgoingChatReason | undefined): string {
  switch (code) {
    case 'EMPTY': return t('chat.empty');
    case 'TOO_LONG': return t('chat.too_long');
    case 'TOO_MANY_LINES': return t('chat.too_many_lines');
    case 'CONTROL_CHARACTER': return t('chat.control_character');
    case 'NOT_A_MEMBER': return t('chat.not_a_member');
    case 'TOO_FAST': return t('chat.too_fast');
    case 'RATE_LIMITED': return t('chat.rate_limited');
    case 'ROOM_UNAVAILABLE': return t('chat.room_unavailable');
    case 'PERSISTENCE_FAILED': return t('chat.persistence_failed');
    default: return t('view.disconnected_reconnecting');
  }
}

function submit(): void {
  if (props.connected && checked.value.ok && sendChat(props.chat, props.transport, text.value).ok) text.value = '';
}
</script>

<template>
  <div>
  <form class="chat-composer" data-testid="chat-composer" @submit.prevent="submit">
    <textarea v-model="text" rows="2" :aria-label="t('chat.message')" :placeholder="t('chat.message')" data-testid="chat-input" />
    <Button type="submit" variant="primary" :disabled="!connected || !checked.ok" data-testid="chat-send">{{ t('chat.send') }}</Button>
    <p v-if="text && !checked.ok" class="note" data-testid="chat-validation">{{ reason(checked.reason) }}</p>
  </form>
  <div v-if="rejection.length" class="chat-rejections">
    <div v-for="entry in rejection" :key="entry.clientMsgId" class="chat-rejection" role="status" data-testid="chat-rejection" :data-reason="entry.reason">
      <p>{{ reason(entry.reason) }}</p>
      <p>{{ entry.text }}</p>
      <button type="button" class="link" :aria-label="t('common.dismiss')" @click="chat.dismiss(entry.clientMsgId)">{{ t('common.dismiss_icon') }}</button>
    </div>
  </div>
  </div>
</template>

<style scoped>
.chat-composer { margin-top: var(--space-3); align-items: stretch; }
textarea { flex: 1 1 10ch; min-width: 0; max-width: 100%; font: inherit; color: inherit; background: var(--surface-2); border: 1px solid var(--border-strong); border-radius: 8px; padding: var(--space-2); resize: vertical; }
.chat-composer p { flex-basis: 100%; }
.chat-rejection { color: var(--danger-text); overflow-wrap: anywhere; }
.chat-rejection p { margin: var(--space-2) 0; }
</style>
