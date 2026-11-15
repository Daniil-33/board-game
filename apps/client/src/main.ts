import { createApp } from 'vue';
import App from './App.vue';
import { socketUrl } from './api/routes';
import { BoardScene, mountBoard } from './board/BoardCanvas';
import { BOARD_MOUNT_KEY, CLIENT_KEY, createClient, type BoardMount } from './client';
import { browserSocketFactory } from './net/socket';
import './style.css';

const client = createClient({
  storage: window.localStorage,
  fetchFn: (input, init) => window.fetch(input, init),
  socketFactory: browserSocketFactory,
  socketUrl: socketUrl(window.location),
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
