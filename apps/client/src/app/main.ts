import { createApp } from 'vue';
import App from './App.vue';
import { runtimeApi } from '../shared/api/index';
import { BoardScene, mountBoard } from '../widgets/board/index';
import { BOARD_MOUNT_KEY, CLIENT_KEY, createClient, type BoardMount } from '../features/client-session/index';
import { browserSocketFactory } from '../shared/api/index';
import './style.css';

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
createApp(App).provide(CLIENT_KEY, client).provide(BOARD_MOUNT_KEY, mount).mount('#app');
