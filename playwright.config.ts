import { defineConfig } from '@playwright/test';
import { config as loadEnvironment } from 'dotenv';

loadEnvironment({ path: '.env', quiet: true });
const baseURL = process.env.TENANT_ORIGIN ?? 'http://127.0.0.1:3000';
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(baseURL).hostname)) {
  throw new Error('Testele browser se execută exclusiv pe loopback.');
}

export default defineConfig({
  testDir: './tests',
  testMatch: 'browser.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  outputDir: 'test-results/browser',
  reporter: [['list']],
  use: {
    baseURL,
    browserName: 'chromium',
    headless: true,
    viewport: { width: 1440, height: 900 },
    // Credentials/CSRF/TOTP are intentionally never recorded in traces or videos.
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    actionTimeout: 15_000,
  },
});
