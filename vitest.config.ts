import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['apps/**/*.test.{ts,tsx}', 'packages/**/*.test.ts', 'tests/contracts/**/*.test.ts', 'tests/specs/**/*.test.ts', 'tests/simulation/**/*.test.ts'],
    exclude: ['tests/database/**/*.test.ts', 'node_modules/**'],
  },
});
