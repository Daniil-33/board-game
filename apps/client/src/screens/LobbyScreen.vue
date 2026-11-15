<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useClient } from '../client';

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
      <h2>Rooms</h2>
      <span class="spacer" />
      <button data-test="refresh" :disabled="client.lobby.busy" @click="client.refreshRooms()">Refresh</button>
      <button data-test="create" class="primary" :disabled="client.lobby.busy" @click="client.createRoom(createCode)">
        Create room
      </button>
    </div>
    <label>Optional room access code <input v-model="createCode" data-test="create-code" autocomplete="off" /></label>
    <div v-if="client.lobby.inviteRoomId" class="warn-box" data-test="invite">
      Invite to room {{ client.lobby.inviteRoomId }}
      <button :disabled="client.lobby.busy" data-test="retry-invite" @click="client.retryInvite()">Retry invite</button>
      <button :disabled="client.lobby.busy" data-test="dismiss-invite" @click="client.dismissInvite()">Dismiss invite</button>
    </div>
    <p v-if="client.lobby.notice" class="warn-box" data-test="notice">{{ client.lobby.notice }}</p>
    <p v-if="client.lobby.error" class="error" data-test="error">{{ client.lobby.error }}</p>
    <p v-if="client.lobby.rooms.length === 0" class="muted" data-test="empty">No rooms to join yet. Create one.</p>
    <ul v-else class="rooms">
      <li v-for="room in client.lobby.rooms" :key="room.roomId" class="room" data-test="room">
        <div>
          <strong>Room {{ room.roomId }}</strong>
          <span class="tag" data-test="room-status">{{ room.status === 'playing' ? 'in play' : room.status !== 'lobby' ? room.status : room.members.length >= 6 ? 'full' : room.locked ? 'locked' : 'open' }}</span>
          <div class="muted" data-test="room-members">
            {{ room.members.map((m) => m.nickname).join(', ') || 'empty' }}
          </div>
        </div>
        <form v-if="room.locked && room.status === 'lobby' && room.members.length < 6" @submit.prevent="client.joinRoom(room.roomId, codes[room.roomId])">
          <label>Access code <input v-model="codes[room.roomId]" :aria-label="`Access code for ${room.roomId}`" data-test="join-code" autocomplete="off" required /></label>
          <button data-test="join" :disabled="client.lobby.busy">Join with code</button>
        </form>
        <button v-else data-test="join" :disabled="client.lobby.busy || !room.joinable" @click="client.joinRoom(room.roomId)">Join</button>
      </li>
    </ul>
  </section>
</template>
