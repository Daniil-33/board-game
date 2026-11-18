<script setup lang="ts">
import { i18n, t } from '../shared/i18n/index';
import CommandToasts from './CommandToasts.vue';
import { UiProvider } from '../shared/ui/index';
import { computed, defineAsyncComponent, defineComponent, h, inject } from 'vue';
import { GAME_OVER_SCREEN_OVERRIDE_KEY, GAME_SCREEN_OVERRIDE_KEY } from './screen-overrides';
import { useClient } from '../features/client-session/index';
import { LobbyScreen } from '../pages/lobby/index';
import { LoginScreen } from '../pages/login/index';
import { RoomScreen } from '../pages/room/index';

const GameLoading = defineComponent({
  setup: () => () => h('div', { class: 'game-loading', role: 'status', 'data-testid': 'game-loading' }, t('game.loading')),
});
const AsyncGameScreen = defineAsyncComponent({
  loader: () => import('../pages/game/index').then(({ GameScreen }) => GameScreen),
  loadingComponent: GameLoading,
  delay: 0,
});
const AsyncGameOverScreen = defineAsyncComponent({
  loader: () => import('../pages/game-over/index').then(({ GameOverScreen }) => GameOverScreen),
  loadingComponent: GameLoading,
  delay: 0,
});
const GameScreen = inject(GAME_SCREEN_OVERRIDE_KEY, AsyncGameScreen);
const GameOverScreen = inject(GAME_OVER_SCREEN_OVERRIDE_KEY, AsyncGameOverScreen);

const client = useClient();
const locale = i18n.global.locale;
const locales = i18n.global.availableLocales;
const showLanguageSelector = locales.some(code => code !== 'ru' && code !== 'en');

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
    <UiProvider>
      <header class="app-header">
        <h1>{{ t('app.board_game') }}</h1>
        <span v-if="client.session.state.guest" class="who" data-testid="who">{{ client.session.state.guest.nickname }}</span>
        <label v-if="showLanguageSelector">
          {{ t('app.language') }}
          <select v-model="locale">
            <option v-for="code in locales" :key="code" :value="code">{{ code }}</option>
          </select>
        </label>
      </header>
      <LoginScreen v-if="screen === 'login'" />
      <LobbyScreen v-else-if="screen === 'lobby'" />
      <RoomScreen v-else-if="screen === 'room'" />
      <GameOverScreen v-else-if="screen === 'finished'" />
      <GameScreen v-else />
      <CommandToasts v-if="screen === 'game'" />
    </UiProvider>
  </main>
</template>
