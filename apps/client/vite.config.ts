import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import VueI18nPlugin from '@intlify/unplugin-vue-i18n/vite';
import { fileURLToPath } from 'node:url';

/** Where the dev server forwards `/api`, `/ws` and `/mock` (the mock server by default). */
const backend = process.env.GAME_BACKEND ?? 'http://127.0.0.1:8787';

export default defineConfig({
  plugins: [vue(), VueI18nPlugin({ include: fileURLToPath(new URL('./src/shared/i18n/locales/**', import.meta.url)), compositionOnly: true, fullInstall: false, dropMessageCompiler: true })],
  define: { __VUE_I18N_FULL_INSTALL__: false, __VUE_I18N_LEGACY_API__: false },
  server: {
    proxy: {
      '/api': { target: backend, changeOrigin: true },
      '/mock': { target: backend, changeOrigin: true },
      '/ws': { target: backend, ws: true, changeOrigin: true },
    },
  },
});
