import 'dotenv/config';
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['**/*.integration.test.ts'],
    exclude: ['**/node_modules/**'],
    testTimeout: 30000,
    fileParallelism: false,
  },
});
