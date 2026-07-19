import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { 'server-only': new URL('./tools/server-only-test.ts', import.meta.url).pathname } },
  test: {
    include: ['apps/**/*.test.{ts,tsx}', 'content/**/*.test.ts', 'packages/**/*.test.ts', 'tests/contracts/**/*.test.ts', 'tests/specs/**/*.test.ts', 'tests/simulation/**/*.test.ts', 'tools/content/**/*.test.ts'],
    exclude: ['tests/database/**/*.test.ts', 'node_modules/**'],
  },
});
