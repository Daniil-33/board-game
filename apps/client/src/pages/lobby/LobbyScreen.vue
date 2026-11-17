<script setup lang="ts">
import { t } from '../../shared/i18n/index';
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useClient } from '../../features/client-session/index';

const REFRESH_MS = 5000;

const client = useClient();
const createCode = ref('');
const codes = ref<Record<string, string>>({});
let timer: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  void client.refreshRooms();
  timer = setInterval(() => {
    if (!client.lobby.busy) void client.refreshRooms({ background: true });
  }, REFRESH_MS);
});
onBeforeUnmount(() => clearInterval(timer));
</script>

<template>
  <section class="panel lobby">
    <div class="row">
      <h2>{{ t('lobby.rooms') }}</h2>
      <span class="spacer" />
      <button data-testid="refresh" :disabled="client.lobby.busy" @click="client.refreshRooms()">{{ t('lobby.refresh') }}</button>
      <button data-testid="create" class="primary" :disabled="client.lobby.busy" @click="client.createRoom(createCode)"> {{ t('lobby.create_room') }} </button>
    </div>
    <label>{{ t('lobby.optional_access_code') }} <input v-model="createCode" data-testid="create-code" autocomplete="off" /></label>
    <div v-if="client.lobby.inviteRoomId" class="warn-box" data-testid="invite"> {{ t('lobby.invite_target', { roomId: client.lobby.inviteRoomId }) }} <button :disabled="client.lobby.busy" data-testid="retry-invite" @click="client.retryInvite()">{{ t('lobby.retry_invite') }}</button>
      <button :disabled="client.lobby.busy" data-testid="dismiss-invite" @click="client.dismissInvite()">{{ t('lobby.dismiss_invite') }}</button>
    </div>
    <p v-if="client.lobby.notice" class="warn-box" data-testid="notice">{{ client.lobby.notice }}</p>
    <p v-if="client.lobby.error" class="error" data-testid="error">{{ client.lobby.error }}</p>
    <p v-if="client.lobby.rooms.length === 0" class="muted" data-testid="empty">{{ t('lobby.empty_rooms') }}</p>
    <ul v-else class="rooms">
      <li v-for="room in client.lobby.rooms" :key="room.roomId" class="room" data-testid="room" :data-room-id="room.roomId">
        <div>
          <strong>{{ t('common.room', { roomId: room.roomId }) }}</strong>
          <span class="tag" data-testid="room-status">{{ room.status === 'playing' ? t('lobby.in_play') : room.status !== 'lobby' ? room.status : room.members.length >= 6 ? t('lobby.full') : room.locked ? t('lobby.locked') : t('lobby.open') }}</span>
          <div class="muted" data-testid="room-members">
            {{ room.members.map((m) => m.nickname).join(', ') || t('lobby.empty') }}
          </div>
        </div>
        <form data-testid="join-form" v-if="room.locked && room.status === 'lobby' && room.members.length < 6" @submit.prevent="client.joinRoom(room.roomId, codes[room.roomId])">
          <label>{{ t('lobby.access_code') }} <input v-model="codes[room.roomId]" :aria-label="t('lobby.access_code_for', { roomId: room.roomId })" data-testid="join-code" autocomplete="off" required /></label>
          <button data-testid="join" :disabled="client.lobby.busy">{{ t('lobby.join_with_code') }}</button>
        </form>
        <button v-else data-testid="join" :disabled="client.lobby.busy || !room.joinable" @click="client.joinRoom(room.roomId)">{{ t('lobby.join') }}</button>
      </li>
    </ul>
  </section>
</template>
