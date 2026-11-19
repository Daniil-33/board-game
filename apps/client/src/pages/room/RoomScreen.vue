<script setup lang="ts">
import { MIN_PLAYERS, MAX_PLAYERS } from '@game/game-core';
import { AlertDialog, Button, Toast } from '../../shared/ui/index';
import { Translation as I18nT } from 'vue-i18n';
import { i18n, t } from '../../shared/i18n/index';
import { computed, ref } from 'vue';
import { useClient } from '../../features/client-session/index';


const client = useClient();
const copyFailed = ref(false);
const copyToast = ref(false);
async function copyInvite(): Promise<void> {
  const link = client.lobby.creatorAccess?.inviteLink;
  if (link === undefined) return;
  copyFailed.value = false;
  copyToast.value = false;
  try {
    await navigator.clipboard.writeText(link);
    copyToast.value = true;
  } catch {
    copyFailed.value = true;
  }
}
const room = computed(() => client.session.state.room);

/** Members by nickname: the live view's players once connected, the lobby summary before that. */
const members = computed(() => {
  const view = client.game.view;
  const ids = view !== null ? view.players.map((p) => p.id as string) : (room.value?.members.map((m) => m.guestId) ?? []);
  return ids.map((id) => ({ id, name: client.nameOf(id) }));
});
const isCreator = computed(() => room.value !== null && room.value.creatorId === client.session.state.guest?.guestId);
const startReason = computed(() => {
  if (!client.game.connected) return t('room.connecting');
  if (members.value.length < MIN_PLAYERS) return t('room.waiting_for_player');
  if (client.lobby.busy) return t('room.busy');
  return '';
});
</script>

<template>
  <section v-if="room" class="room-view">
    <header class="room-heading">
      <p class="muted">{{ t('room.heading', { players: members.length, capacity: MAX_PLAYERS, count: MAX_PLAYERS }, MAX_PLAYERS) }}</p>
      <h2 class="shell-heading" data-testid="room-title">{{ t('common.room', { roomId: room.roomId }) }}</h2>
    </header>
    <p v-if="client.game.fatal" class="error" data-testid="fatal">{{ client.game.fatal }}</p>
    <p v-else-if="!client.game.connected" class="muted" data-testid="connecting">{{ t('room.connecting') }}</p>
    <p v-if="client.game.problem" class="warn-box" data-testid="problem">{{ client.game.problem }}</p>
    <ul v-if="client.game.messages.length > 0" class="messages">
      <li v-for="message in client.game.messages" :key="message.id" class="error" data-testid="message" :data-code="message.code">
        <i18n-t tag="span" :i18n="i18n.global" keypath="common.server_message">
          <template #code><strong>{{ message.code }}</strong></template>
          <template #message>{{ message.message }}</template>
        </i18n-t>
        <button data-testid="message-dismiss" class="link" :aria-label="t('common.dismiss')" @click="client.connection.dismissMessage(message.id)">{{ t('common.dismiss_icon') }}</button>
      </li>
    </ul>
    <ul class="shell-card seats" :aria-label="t('common.players')">
      <li v-for="seat in MAX_PLAYERS" :key="seat" :data-testid="members[seat - 1] ? 'member' : 'empty-seat'">
        <template v-if="members[seat - 1]">
          <span class="avatar" :style="{ '--seat-color': 'var(--player-' + seat + ')' }" aria-hidden="true">{{ Array.from(members[seat - 1]!.name)[0] }}</span>
          <strong>{{ members[seat - 1]!.name }}</strong>
          <span v-if="members[seat - 1]!.id === room.creatorId" class="muted">{{ t('room.host') }}</span>
          <span v-if="members[seat - 1]!.id === client.session.state.guest?.guestId" class="muted">{{ t('common.you') }}</span>
        </template>
        <template v-else>
          <span class="avatar empty" aria-hidden="true">{{ t('room.empty_marker') }}</span>
          <span class="muted">{{ t('room.empty_seat') }}</span>
        </template>
      </li>
    </ul>
    <section v-if="isCreator && client.lobby.creatorAccess" class="shell-card invite" data-testid="creator-access">
      <div>
        <label for="invite-link">{{ t('room.invite_link') }}</label>
        <div class="shell-actions">
          <input id="invite-link" :value="client.lobby.creatorAccess.inviteLink" readonly data-testid="invite-link" @focus="($event.target as HTMLInputElement).select()" />
          <Button data-testid="copy-invite" @click="copyInvite">{{ t('room.copy_invite') }}</Button>
        </div>
      </div>
      <div class="invite-code">
        <span class="muted">{{ t('room.access_code') }}</span>
        <strong data-testid="access-code">{{ client.lobby.creatorAccess.accessCode }}</strong>
      </div>
      <p v-if="copyFailed" role="status" class="error">{{ t('room.copy_unavailable') }}</p>
      <Toast v-model:open="copyToast" :message="t('room.invite_copied')" />
    </section>
    <p v-if="client.lobby.error" class="error" data-testid="error">{{ client.lobby.error }}</p>
    <div class="shell-actions room-actions">
      <AlertDialog v-if="isCreator" responsive :title="t('room.leave_title')" :description="t('room.leave_warning')">
        <template #trigger>
          <Button data-testid="leave" variant="danger" :disabled="client.lobby.busy || !!client.game.fatal">{{ t('room.leave_room') }}</Button>
        </template>
        <template #cancel><Button>{{ t('room.cancel_leave') }}</Button></template>
        <template #action><Button data-testid="confirm-leave" variant="danger" @click="client.leaveRoom()">{{ t('room.confirm_leave') }}</Button></template>
      </AlertDialog>
      <Button v-else data-testid="leave" :disabled="client.lobby.busy || !!client.game.fatal" @click="client.leaveRoom()">{{ t('room.leave_room') }}</Button>
      <Button v-if="isCreator" data-testid="start" variant="primary" :disabled="!!startReason" :reason="startReason" @click="client.startGame()">{{ t('room.start_game') }}</Button>
      <p v-else class="muted" data-testid="waiting">{{ t('room.waiting_for_host') }}</p>
    </div>
  </section>
</template>

<style scoped>
.room-view { width: min(100%, 69rem); margin-inline: auto; }
.room-heading { text-align: center; margin-bottom: var(--space-6); }
.seats { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: var(--space-3); text-align: center; padding: 0; background: none; border: 0; box-shadow: none; }
.seats li { display: grid; align-content: start; justify-items: center; gap: var(--space-1); padding: var(--space-4) var(--space-2); border: 1px solid var(--border-subtle); background: var(--surface-1); border-radius: var(--design-radius-xl); }
.seats li[data-testid="empty-seat"] { border-style: dashed; background: none; }
.avatar { display: grid; place-items: center; width: clamp(2.875rem, 7vw, 4.5rem); aspect-ratio: 1; margin-bottom: var(--space-2); border-radius: 50%; background: var(--seat-color); color: var(--on-accent); font: 650 1.25rem var(--design-font-display); }
.avatar.empty { border: 1px dashed var(--border-strong); color: var(--text-muted); }
.seats .muted { font-size: .8rem; }
.invite { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--space-4); margin-top: var(--space-4); }
.invite .shell-actions { margin-top: var(--space-2); }
.invite input { width: auto; }
.invite-code { display: grid; align-content: start; gap: var(--space-2); }
.room-actions { justify-content: center; margin-top: var(--space-4); }
.room-actions :deep(.primary) { margin-top: 0; }
.room-actions :deep(.ds-disabled-reason) { display: block; }
@media (width < 600px) {
  .seats { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .invite { grid-template-columns: minmax(0, 1fr); }
  .invite input { flex-basis: 100%; }
}
</style>
