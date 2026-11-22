import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts', 'server/**/*.test.ts'],
    environment: 'node',
    // Database suites share one local database, so files run one at a time.
    fileParallelism: false,
  },
});
