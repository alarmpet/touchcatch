import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/database/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    pool: 'forks',
    maxWorkers: 1,
  },
});
