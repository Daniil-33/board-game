import { i18n, registerLocales } from '../shared/i18n/index';
import { createApp, watchEffect } from 'vue';
import App from './App.vue';
import { runtimeApi } from '../shared/api/index';
import { BoardScene, mountBoard } from '../widgets/board/index';
import { BOARD_MOUNT_KEY, CLIENT_KEY, createClient, type BoardMount } from '../features/client-session/index';
import { browserSocketFactory } from '../shared/api/index';
import './fonts.css';
import './style.css';
import { installSoundGate } from '../shared/sound/index';

registerLocales();
installSoundGate();
const storedLocale = window.localStorage.getItem('game.locale');
if (storedLocale && i18n.global.availableLocales.includes(storedLocale)) {
  i18n.global.locale.value = storedLocale;
}
watchEffect(() => {
  document.documentElement.lang = i18n.global.locale.value;
  document.title = i18n.global.t('app.board_game');
});
watchEffect(() => {
  if (i18n.global.locale.value !== 'ru' || storedLocale) {
    window.localStorage.setItem('game.locale', i18n.global.locale.value);
  }
});

if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('ds')) {
  void import('./DesignSystem.vue').then(({ default: DesignSystem }) => createApp(DesignSystem).use(i18n).mount('#app'));
} else {
  mountGame();
}

function mountGame() {
  const api = runtimeApi(window.location, window.__GAME_CONFIG__?.API_ORIGIN);

  const client = createClient({
    storage: window.localStorage,
    fetchFn: api.fetch((input, init) => window.fetch(input, init)),
    socketFactory: browserSocketFactory,
    socketUrl: api.socketUrl,
    now: () => Date.now(),
    initialUrl: window.location.href,
    replaceUrl: (url) => window.history.replaceState(null, '', url),
  });

  const mount: BoardMount = async (host) => {
    const board = new BoardScene();
    const destroy = await mountBoard(host, board);
    return { board, destroy };
  };

  client.start();
  createApp(App).use(i18n).provide(CLIENT_KEY, client).provide(BOARD_MOUNT_KEY, mount).mount('#app');
}
