<script setup lang="ts">
import { t } from '../../shared/i18n/index';
import { computed, ref } from 'vue';
import { useClient } from '../../features/client-session/index';

/** The Start button needs at least this many members (task handoff, criterion 2). */
const MEMBERS_TO_START = 2;

const client = useClient();
const copied = ref<string | null>(null);
async function copyInvite(): Promise<void> {
  const link = client.lobby.creatorAccess?.inviteLink;
  if (link === undefined) return;
  try { await navigator.clipboard.writeText(link); copied.value = t('room.invite_copied'); }
  catch { copied.value = t('room.copy_unavailable_select'); }
}
const room = computed(() => client.session.state.room);

/** Members by nickname: the live view's players once connected, the lobby summary before that. */
const members = computed(() => {
  const view = client.game.view;
  const ids = view !== null ? view.players.map((p) => p.id as string) : (room.value?.members.map((m) => m.guestId) ?? []);
  return ids.map((id) => ({ id, name: client.nameOf(id) }));
});
const isCreator = computed(() => room.value !== null && room.value.creatorId === client.session.state.guest?.guestId);
const canStart = computed(() => client.game.connected && members.value.length >= MEMBERS_TO_START && !client.lobby.busy);
</script>

<template>
  <section v-if="room" class="panel room-view">
    <h2 data-testid="room-title">{{ t('common.room', { value0: room.roomId }) }}</h2>
    <p v-if="client.game.fatal" class="error" data-testid="fatal">{{ client.game.fatal }}</p>
    <p v-else-if="!client.game.connected" class="muted" data-testid="connecting">{{ t('room.connecting') }}</p>
    <p v-if="client.game.problem" class="warn-box" data-testid="problem">{{ client.game.problem }}</p>
    <ul v-if="client.game.messages.length > 0" class="messages">
      <li v-for="message in client.game.messages" :key="message.id" class="error" data-testid="message" :data-code="message.code">
        <span><strong>{{ message.code }}</strong>{{ t('common.symbol', { value0: message.message }) }}</span>
        <button data-testid="message-dismiss" class="link" :aria-label="t('common.dismiss')" @click="client.connection.dismissMessage(message.id)">{{ t('common.symbol_2') }}</button>
      </li>
    </ul>
    <div v-if="isCreator && client.lobby.creatorAccess" class="warn-box" data-testid="creator-access">
      <p>{{ t('room.access_code') }} <strong data-testid="access-code">{{ client.lobby.creatorAccess.accessCode }}</strong></p>
      <label>{{ t('room.invite_link') }} <input :value="client.lobby.creatorAccess.inviteLink" readonly data-testid="invite-link" @focus="($event.target as HTMLInputElement).select()" /></label>
      <button data-testid="copy-invite" @click="copyInvite">{{ t('room.copy_invite') }}</button>
      <p v-if="copied" role="status">{{ copied }}</p>
    </div>
    <button data-testid="leave" :disabled="client.lobby.busy || !!client.game.fatal" @click="client.leaveRoom()">{{ t('room.leave_room') }}</button>
    <h3>{{ t('common.players') }}</h3>
    <ul class="members">
      <li v-for="member in members" :key="member.id" data-testid="member">
        {{ member.name }}
        <span v-if="member.id === room.creatorId" class="tag">{{ t('room.host') }}</span>
        <span v-if="member.id === client.session.state.guest?.guestId" class="tag">{{ t('common.you') }}</span>
      </li>
    </ul>
    <p v-if="client.lobby.error" class="error" data-testid="error">{{ client.lobby.error }}</p>
    <button v-if="isCreator" data-testid="start" class="primary" :disabled="!canStart" @click="client.startGame()"> {{ t('room.start_game') }} </button>
    <p v-else class="muted" data-testid="waiting">{{ t('room.waiting_for_the') }}</p>
    <p v-if="isCreator && members.length < MEMBERS_TO_START" class="muted">{{ t('room.waiting_for_a') }}</p>
  </section>
</template>
