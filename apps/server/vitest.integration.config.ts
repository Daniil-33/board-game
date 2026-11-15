import { defineConfig } from 'vitest/config';

// `pnpm test:integration`: needs the Postgres named by TEST_DATABASE_URL
// (default: docker-compose.dev.yml) and fails when it is unreachable.
export default defineConfig({
  test: {
    include: ['src/__tests__/**/*.int.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
