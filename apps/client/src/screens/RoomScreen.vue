<script setup lang="ts">
import { computed } from 'vue';
import { useClient } from '../client';

/** The Start button needs at least this many members (task handoff, criterion 2). */
const MEMBERS_TO_START = 2;

const client = useClient();
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
    <h2>Room {{ room.roomId }}</h2>
    <p v-if="client.game.fatal" class="error" data-test="fatal">{{ client.game.fatal }}</p>
    <p v-else-if="!client.game.connected" class="muted" data-test="connecting">Connecting…</p>
    <p v-if="client.game.problem" class="warn-box" data-test="problem">{{ client.game.problem }}</p>
    <ul v-if="client.game.messages.length > 0" class="messages">
      <li v-for="message in client.game.messages" :key="message.id" class="error" data-test="message">
        <span><strong>{{ message.code }}</strong>: {{ message.message }}</span>
        <button class="link" aria-label="Dismiss" @click="client.connection.dismissMessage(message.id)">×</button>
      </li>
    </ul>
    <h3>Players</h3>
    <ul class="members">
      <li v-for="member in members" :key="member.id" data-test="member">
        {{ member.name }}
        <span v-if="member.id === room.creatorId" class="tag">host</span>
        <span v-if="member.id === client.session.state.guest?.guestId" class="tag">you</span>
      </li>
    </ul>
    <p v-if="client.lobby.error" class="error" data-test="error">{{ client.lobby.error }}</p>
    <button v-if="isCreator" data-test="start" class="primary" :disabled="!canStart" @click="client.startGame()">
      Start game
    </button>
    <p v-else class="muted" data-test="waiting">Waiting for the host to start the game.</p>
    <p v-if="isCreator && members.length < MEMBERS_TO_START" class="muted">Waiting for a second player.</p>
  </section>
</template>
