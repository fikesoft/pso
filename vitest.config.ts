import { defineConfig } from 'vitest/config';
export default defineConfig({
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts', 'scripts/**/*.test.mjs'],
    exclude: ['packages/db/test/**', '**/*.integration.test.ts', '**/node_modules/**'],
    testTimeout: 15000,
  },
});
