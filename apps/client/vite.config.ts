import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import VueI18nPlugin from '@intlify/unplugin-vue-i18n/vite';
import { fileURLToPath } from 'node:url';

/** Where the dev server forwards `/api`, `/ws` and `/mock` (the mock server by default). */
const backend = process.env.GAME_BACKEND ?? 'http://127.0.0.1:8787';

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    VueI18nPlugin({ include: fileURLToPath(new URL('./src/shared/i18n/locales/**', import.meta.url)), compositionOnly: true, fullInstall: false, dropMessageCompiler: true }),
    {
      name: 'exclude-development-design-system',
      apply: 'build',
      generateBundle(_options, bundle) {
        for (const output of Object.values(bundle)) {
          if (output.type === 'chunk' && Object.keys(output.modules).some(id => id.includes('/app/DesignSystem.vue'))) {
            this.error('The development design system must not ship in production.');
          }
        }
      },
    },
  ],
  define: { __VUE_I18N_FULL_INSTALL__: false, __VUE_I18N_LEGACY_API__: false },
  build: {
    assetsInlineLimit: (filePath) =>
      /\/catalog\/logos\/(?:brand|geometric)\//.test(filePath.replaceAll('\\', '/')) ? false : undefined,
    rollupOptions: {
      // Ship the resolver and assets before the board and panels start importing it.
      input: {
        app: fileURLToPath(new URL('./index.html', import.meta.url)),
        logos: fileURLToPath(new URL('./src/shared/lib/logos/index.ts', import.meta.url)),
      },
      preserveEntrySignatures: 'exports-only',
      plugins: [{
        name: 'check-external-logo-assets',
        generateBundle(_, bundle) {
          for (const output of Object.values(bundle)) {
            if (output.type === 'chunk' && output.code.includes('data:image/svg')) {
              this.error(`Inline SVG in ${output.fileName}. Catalog logos must be emitted as separate assets.`);
            }
          }
        },
      }],
    },
  },
  server: {
    proxy: {
      '/api': { target: backend, changeOrigin: true },
      '/mock': { target: backend, changeOrigin: true },
      '/ws': { target: backend, ws: true, changeOrigin: true },
    },
  },
});
