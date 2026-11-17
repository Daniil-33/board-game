import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'happy-dom',
    setupFiles: ['src/__tests__/setup-i18n.ts'],
    include: ['src/__tests__/**/*.test.ts', 'mock/__tests__/**/*.test.ts'],
  },
});
