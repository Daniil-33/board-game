<script setup lang="ts">
import { t } from '../shared/i18n/index';
import { computed } from 'vue';
import { useClient } from '../features/client-session/index';
import { GameOverScreen } from '../pages/game-over/index';
import { GameScreen } from '../pages/game/index';
import { LobbyScreen } from '../pages/lobby/index';
import { LoginScreen } from '../pages/login/index';
import { RoomScreen } from '../pages/room/index';

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
  <main class="app" :data-screen="screen" :data-testid="`screen-${screen}`">
    <header class="app-header">
      <h1>{{ t('app.board_game') }}</h1>
      <span v-if="client.session.state.guest" class="who" data-testid="who">{{ client.session.state.guest.nickname }}</span>
    </header>
    <LoginScreen v-if="screen === 'login'" />
    <LobbyScreen v-else-if="screen === 'lobby'" />
    <RoomScreen v-else-if="screen === 'room'" />
    <GameOverScreen v-else-if="screen === 'finished'" />
    <GameScreen v-else />
  </main>
</template>
