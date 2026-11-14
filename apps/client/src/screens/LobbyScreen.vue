<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';
import { useClient } from '../client';

const REFRESH_MS = 5000;

const client = useClient();
let timer: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  void client.refreshRooms();
  timer = setInterval(() => {
    if (!client.lobby.busy) void client.refreshRooms();
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
      <button data-test="create" class="primary" :disabled="client.lobby.busy" @click="client.createRoom()">
        Create room
      </button>
    </div>
    <p v-if="client.lobby.notice" class="warn-box" data-test="notice">{{ client.lobby.notice }}</p>
    <p v-if="client.lobby.error" class="error" data-test="error">{{ client.lobby.error }}</p>
    <p v-if="client.lobby.rooms.length === 0" class="muted" data-test="empty">No rooms to join yet. Create one.</p>
    <ul v-else class="rooms">
      <li v-for="room in client.lobby.rooms" :key="room.roomId" class="room" data-test="room">
        <div>
          <strong>Room {{ room.roomId }}</strong>
          <div class="muted" data-test="room-members">
            {{ room.members.map((m) => m.nickname).join(', ') || 'empty' }}
          </div>
        </div>
        <button data-test="join" :disabled="client.lobby.busy" @click="client.joinRoom(room.roomId)">Join</button>
      </li>
    </ul>
  </section>
</template>
