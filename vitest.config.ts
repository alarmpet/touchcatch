import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'tests/contracts/**/*.test.ts'],
    exclude: ['tests/database/**/*.test.ts', 'node_modules/**'],
  },
});
