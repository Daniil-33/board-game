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
      <button data-test="refresh" :disabled="client.lobby.busy" @click="client.refreshRooms()">{{ t('lobby.refresh') }}</button>
      <button data-test="create" class="primary" :disabled="client.lobby.busy" @click="client.createRoom(createCode)"> {{ t('lobby.create_room') }} </button>
    </div>
    <label>{{ t('lobby.optional_room_access') }} <input v-model="createCode" data-test="create-code" autocomplete="off" /></label>
    <div v-if="client.lobby.inviteRoomId" class="warn-box" data-test="invite"> {{ t('lobby.invite_to_room', { value0: client.lobby.inviteRoomId }) }} <button :disabled="client.lobby.busy" data-test="retry-invite" @click="client.retryInvite()">{{ t('lobby.retry_invite') }}</button>
      <button :disabled="client.lobby.busy" data-test="dismiss-invite" @click="client.dismissInvite()">{{ t('lobby.dismiss_invite') }}</button>
    </div>
    <p v-if="client.lobby.notice" class="warn-box" data-test="notice">{{ client.lobby.notice }}</p>
    <p v-if="client.lobby.error" class="error" data-test="error">{{ client.lobby.error }}</p>
    <p v-if="client.lobby.rooms.length === 0" class="muted" data-test="empty">{{ t('lobby.no_rooms_to') }}</p>
    <ul v-else class="rooms">
      <li v-for="room in client.lobby.rooms" :key="room.roomId" class="room" data-test="room">
        <div>
          <strong>{{ t('common.room', { value0: room.roomId }) }}</strong>
          <span class="tag" data-test="room-status">{{ room.status === 'playing' ? t('lobby.in_play') : room.status !== 'lobby' ? room.status : room.members.length >= 6 ? t('lobby.full') : room.locked ? t('lobby.locked') : t('lobby.open') }}</span>
          <div class="muted" data-test="room-members">
            {{ room.members.map((m) => m.nickname).join(', ') || t('lobby.empty') }}
          </div>
        </div>
        <form v-if="room.locked && room.status === 'lobby' && room.members.length < 6" @submit.prevent="client.joinRoom(room.roomId, codes[room.roomId])">
          <label>{{ t('lobby.access_code') }} <input v-model="codes[room.roomId]" :aria-label="t('lobby.access_code_for', { roomId: room.roomId })" data-test="join-code" autocomplete="off" required /></label>
          <button data-test="join" :disabled="client.lobby.busy">{{ t('lobby.join_with_code') }}</button>
        </form>
        <button v-else data-test="join" :disabled="client.lobby.busy || !room.joinable" @click="client.joinRoom(room.roomId)">{{ t('lobby.join') }}</button>
      </li>
    </ul>
  </section>
</template>
