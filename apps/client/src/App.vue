<script setup lang="ts">
import { computed } from 'vue';
import { useClient } from './client';
import GameOverScreen from './screens/GameOverScreen.vue';
import GameScreen from './screens/GameScreen.vue';
import LobbyScreen from './screens/LobbyScreen.vue';
import LoginScreen from './screens/LoginScreen.vue';
import RoomScreen from './screens/RoomScreen.vue';

const client = useClient();

/** No router: the screen follows the session and the server view's phase. */
const screen = computed(() => {
  if (client.session.state.guest === null) return 'login';
  if (client.session.state.room === null) return 'lobby';
  const phase = client.game.view?.phase;
  if (phase === 'finished') return 'finished';
  return phase === 'setup' || phase === 'playing' ? 'game' : 'room';
});
</script>

<template>
  <main class="app" :data-screen="screen">
    <header class="app-header">
      <h1>Board game</h1>
      <span v-if="client.session.state.guest" class="who" data-test="who">{{ client.session.state.guest.nickname }}</span>
    </header>
    <LoginScreen v-if="screen === 'login'" />
    <LobbyScreen v-else-if="screen === 'lobby'" />
    <RoomScreen v-else-if="screen === 'room'" />
    <GameOverScreen v-else-if="screen === 'finished'" />
    <GameScreen v-else />
  </main>
</template>
