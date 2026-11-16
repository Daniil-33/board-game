import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export default defineConfig(base, {
  testMatch: '**/staging.smoke.ts',
  timeout: 180_000,
  outputDir: 'test-results/staging',
  use: { ...base.use, baseURL: 'https://stage.focusima.space' },
});
