import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

/** Where the dev server forwards `/api`, `/ws` and `/mock` (the mock server by default). */
const backend = process.env.GAME_BACKEND ?? 'http://127.0.0.1:8787';

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/api': { target: backend, changeOrigin: true },
      '/mock': { target: backend, changeOrigin: true },
      '/ws': { target: backend, ws: true, changeOrigin: true },
    },
  },
});
