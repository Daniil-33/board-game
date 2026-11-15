import { defineConfig } from 'vitest/config';

// `pnpm test`: tests that need nothing but Node. The Postgres-backed
// `*.int.test.ts` files run through vitest.integration.config.ts.
export default defineConfig({
  test: {
    include: ['src/__tests__/**/*.test.ts'],
    exclude: ['src/__tests__/**/*.int.test.ts'],
  },
});
